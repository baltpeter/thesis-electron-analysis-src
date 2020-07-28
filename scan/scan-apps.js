const { pg, db } = require('../common/database');
const { audit } = require('./npm-audit');
const { statisticsFromElectronegativityResult } = require('./statistics');
const chalk = require('chalk');
const _en = require('@baltpeter/ba-en');

const EN_CHECKS = [
    'loadedwebsitesjscheck',
    'protocolhandlerjscheck',
    'userprovidedhtmljscheck',
    'userprovidedcodeexecutionjscheck',
    'dangerousfunctionsjscheck',
    'openexternaljscheck',
    'cspglobalcheck',

    'devtoolsjscheck',
    'contextisolationjscheck',
    'nodeintegrationhtmlcheck',
    'nodeintegrationjscheck',
    'remotemodulejscheck',
    'sandboxjscheck',
    'websecurityhtmlcheck',
    'websecurityjscheck',
];

const electronegativity = async (path) => {
    const result = await _en({
        input: path,
        customScan: EN_CHECKS,
        isRelative: true,
        benni: true,
    }).catch((err) => console.error(err));
    return result || false;
};

let apps;
async function main() {
    console.log('Started:', new Date());
    console.time('scan-apps');
    apps = await db.any(
        'SELECT am.* FROM apps_meta AS am LEFT JOIN app_scans ON am.slug = app_scans.slug WHERE am.downloaded IS TRUE' +
            (process.argv[2] ? ' AND am.slug LIKE ${slug_filter}' : ' AND app_scans.scanned IS NOT TRUE'),
        { slug_filter: process.argv[2] }
    );

    for (const app of apps) {
        // Style for numbers.
        const n = chalk.blue.bold;
        console.log(chalk.underline(`Trying to scan ${app.slug}…`));

        // Scan using Electronegativity.
        const en_result = await electronegativity(app.extracted_dir);
        const stats = statisticsFromElectronegativityResult(en_result);
        if (!en_result) {
            console.error(chalk.red(`Running Electronegativity failed for ${app.slug}.`));
            continue;
        }

        console.log(`Found ${n(en_result.issues.length)} issues.`);
        if (en_result.errors.length > 0) {
            console.log(`Encountered ${chalk.red(en_result.errors.length)} error(s) while parsing.`);
        }

        // Find vulnerabilities in dependencies using `npm audit`.
        const audit_result = audit(app.extracted_dir);
        if (!audit_result) console.error(chalk.red(`Running \`npm audit\` failed for ${app.slug}.`));

        const v = audit_result && audit_result.metadata && audit_result.metadata.vulnerabilities;
        // prettier-ignore
        if(v) console.log(`Found ${n(v.low)} low, ${n(v.moderate)} moderate, ${n(v.high)} high, and ${n(v.critical)} critical vulnerabilities in the dependencies.`);

        await db
            .none(
                'INSERT INTO app_scans(slug,stats,electronegativity_results,electronegativity_errors,audit_result,scanned) VALUES(${slug}, ${stats}, ${results}, ${errors}, ${audit_result}, TRUE) ON CONFLICT(slug) DO UPDATE SET stats=EXCLUDED.stats, electronegativity_results=EXCLUDED.electronegativity_results, electronegativity_errors=EXCLUDED.electronegativity_errors, audit_result=EXCLUDED.audit_result, scanned=EXCLUDED.scanned',
                {
                    slug: app.slug,
                    stats: JSON.stringify(stats),
                    results: JSON.stringify(en_result.issues),
                    errors: JSON.stringify(en_result.errors),
                    audit_result: JSON.stringify(audit_result),
                }
            )
            .catch((e) => console.error(e));

        console.log();
    }
    console.timeEnd('scan-apps');
    console.log('Ended:', new Date());
}

main();
