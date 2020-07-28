const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const octokit = require('../common/octokit');
const { pg, db } = require('../common/database');
const { merge, uniqueByKey } = require('../common/util');

const cleanupSlug = (slug) => slug.replace('/', '_').replace(/[^A-Za-z0-9_-]/, '');

async function main() {
    console.time('collect-apps');

    // ---------------------------------------------------------
    // Collect from Electron app list.
    // ---------------------------------------------------------

    console.log('Collecting apps from Electron app list…');

    // Clone `https://github.com/electron/apps.git` into `apps`.
    const apps_list_dir = path.resolve(__dirname, 'apps/apps');

    const apps_from_list = fs
        .readdirSync(apps_list_dir)
        .map((slug) => path.resolve(apps_list_dir, slug, slug + '.yml'))
        .filter((filepath) => fs.existsSync(filepath))
        .map((filepath) => ({
            ...yaml.safeLoad(fs.readFileSync(filepath, 'utf-8')),
            slug: path.basename(filepath, '.yml'),
        }))
        .map((doc) => ({
            slug: cleanupSlug(doc.slug),
            name: doc.name,
            url: doc.website,
            repository: doc.repository ? doc.repository.replace(/\.git$/, '').replace(/\/$/, '') : undefined,
        }));

    console.log(`Found ${apps_from_list.length} apps in the list.`);

    // ---------------------------------------------------------
    // Collect from GitHub tags.
    // ---------------------------------------------------------

    console.log('Collecting apps from GitHub tags…');

    const github_apps = await octokit.paginate(
        'GET /search/repositories',
        {
            q: 'topic:electron+stars:>50',
            sort: 'stars',
            order: 'desc',
            per_page: 100,
        },
        (response) =>
            response.data.map((repo) => ({
                slug: cleanupSlug(repo.full_name),
                name: repo.name,
                url: repo.homepage,
                repository: repo.html_url,
            }))
    );

    console.log(`Found ${github_apps.length} apps on GitHub.`);

    // ---------------------------------------------------------
    // Merge and insert into DB.
    // ---------------------------------------------------------

    console.log('Merging results…');

    const apps = merge(uniqueByKey(apps_from_list, 'repository'), github_apps, 'repository');
    console.log(`After deduplication, ${apps.length} apps are remaining.`);

    console.log('Inserting into database…');

    // See: https://stackoverflow.com/a/36234281
    // We unfortunately cannot use the helpers (https://github.com/vitaly-t/pg-promise/wiki/Data-Imports) because they
    // don't support 'upsert'.
    await db
        .task((t) => {
            const queries = apps.map((a) =>
                t.none(
                    'INSERT INTO apps(slug, name, url, repository) VALUES(${slug}, ${name}, ${url}, ${repository}) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, url=EXCLUDED.url, repository=EXCLUDED.repository',
                    a
                )
            );

            return t.batch(queries);
        })
        .catch((e) => console.error(e));

    console.log('Done.');
    console.timeEnd('collect-apps');
}

main();
