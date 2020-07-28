const { pg, db } = require('../common/database');
const { downloadFile, identifyFile, findNearestFile } = require('../common/util');
const { extract } = require('./extract');
const { isExtractedElectron } = require('./electron-detection');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const nodegit = require('nodegit');
const asar = require('asar');

const OUTPUT_DIR = '/data/apps';

const downloadAndExtract = async (download_url, dest_dir) => {
    const dl_path = await downloadFile(download_url, dest_dir);
    if (!dl_path) return false;

    const mime_type = identifyFile(dl_path);
    console.log('Downloaded', dl_path, 'identified as', mime_type);

    return await extract(dl_path, mime_type, path.join(dest_dir, 'extracted'));
};
const tryToFindElectron = async (extracted_dir, dest_dir) => {
    // If we're lucky, the archive contained an extracted Electron app already.
    const electron_dir = await isExtractedElectron(extracted_dir);
    if (electron_dir) return electron_dir;

    // Otherwise, we will hopefully find an `app.asar`.
    const asar_path = findNearestFile('*.asar', extracted_dir);
    if (!asar_path) return false;

    const asar_extracted_dir = path.join(dest_dir, 'asar_extracted');
    try {
        console.log('Extracting ASAR:', asar_path);
        asar.extractAll(asar_path, asar_extracted_dir);
    } catch (e) {
        console.log(e);
        return false;
    }

    return (await isExtractedElectron(asar_extracted_dir)) || false;
};

// These strategies are executed in order until one is successful. The handler is passed both the app object from the DB
// and a directory. The handler is allowed to write arbitrary files into that directory. It returns the directory of the
// executed app if successful (will be a subdirectory of `dest_dir`) or `false` if the strategy failed.
const DOWNLOAD_STRATEGIES = [
    {
        name: 'git-clone',
        handler: async (app, dest_dir) => {
            const repo = app.repository_override || app.repository;
            if (!repo) return false;

            const clone_dir = path.join(dest_dir, 'clone');

            await nodegit.Clone(repo, clone_dir).catch((e) => {
                console.log(e);
            });

            return (await isExtractedElectron(clone_dir)) || false;
        },
    },
    {
        name: 'linux-binary',
        handler: async (app, dest_dir) => {
            if (!app.linux_download) return false;

            const extracted_dir = await downloadAndExtract(app.linux_download, dest_dir);
            if (!extracted_dir) return false;

            return await tryToFindElectron(extracted_dir, dest_dir);
        },
    },
    {
        name: 'mac-binary',
        handler: async (app, dest_dir) => {
            if (!app.mac_download) return false;

            const extracted_dir = await downloadAndExtract(app.mac_download, dest_dir);
            if (!extracted_dir) return false;

            return await tryToFindElectron(extracted_dir, dest_dir);
        },
    },
    {
        name: 'windows-binary',
        handler: async (app, dest_dir) => {
            if (!app.windows_download) return false;

            const extracted_dir = await downloadAndExtract(app.windows_download, dest_dir);
            if (!extracted_dir) return false;

            return await tryToFindElectron(extracted_dir, dest_dir);
        },
    },
];

let apps;
let successes = 0;
async function main() {
    console.time('fetch-apps');

    apps = await db.any(
        'SELECT apps.*, ad.repository_override, ad.windows_download, ad.mac_download, ad.linux_download FROM apps LEFT JOIN app_downloads AS ad ON apps.slug = ad.slug LEFT JOIN apps_meta AS am on apps.slug = am.slug WHERE apps.skip IS NOT TRUE AND am.downloaded IS NOT TRUE' +
            (process.argv[2] ? ' AND apps.slug LIKE ${slug_filter}' : ''),
        { slug_filter: process.argv[2] }
    );

    for (const app of apps) {
        console.log(chalk.underline(`Trying to download and extract app ${app.name} (${app.slug})…`));

        const app_dest_dir = path.join(OUTPUT_DIR, app.slug);
        fs.removeSync(app_dest_dir);
        fs.ensureDirSync(app_dest_dir);

        let current_strategy_index = 0;
        let result = false;
        while (!result && current_strategy_index < DOWNLOAD_STRATEGIES.length) {
            const current_strategy = DOWNLOAD_STRATEGIES[current_strategy_index];
            console.log(`Trying ${current_strategy.name} strategy…`);

            const strategy_dest_dir = path.join(app_dest_dir, current_strategy.name);
            fs.ensureDirSync(strategy_dest_dir);
            result = await current_strategy.handler(app, strategy_dest_dir);

            if (!result) {
                console.log(`Strategy ${current_strategy.name} failed for ${app.name}.`);
                fs.removeSync(strategy_dest_dir);
                current_strategy_index++;
            }
        }

        if (result) {
            console.log(chalk.green(`Successfully extracted ${app.name} to ${result}.`));
            await db.none(
                'INSERT INTO apps_meta(slug,downloaded,extracted_dir,download_strategy) VALUES(${slug}, ${downloaded}, ${extracted_dir}, ${download_strategy}) ON CONFLICT(slug) DO UPDATE SET downloaded=EXCLUDED.downloaded, extracted_dir=EXCLUDED.extracted_dir, download_strategy=EXCLUDED.download_strategy',
                {
                    slug: app.slug,
                    downloaded: true,
                    extracted_dir: result,
                    download_strategy: DOWNLOAD_STRATEGIES[current_strategy_index].name,
                }
            );
            successes++;
        } else {
            console.error(chalk.red(`Failed to extract ${app.name}.`));
            fs.removeSync(app_dest_dir);
        }

        console.log();
    }
    console.log(`Successes: ${successes} of ${apps.length}`);
    console.timeEnd('fetch-apps');
}

process.on('SIGINT', function () {
    console.log(chalk.blue('Caught interrupt signal, shutting down.'));
    console.log(`Successes in this run: ${successes} of ${apps.length}`);

    process.exit();
});

main();
