const child_process = require('child_process');

const audit = (path) => {
    try {
        child_process.execFileSync('npm', ['i', '--package-lock-only'], {
            env: {},
            cwd: path,
            stdio: 'ignore',
            timeout: 1000 * 60,
        });
    } catch {
        return false;
    }

    let output;
    try {
        output = child_process
            .execFileSync('npm', ['audit', '--json'], { env: {}, cwd: path, timeout: 1000 * 60 * 5 })
            .toString()
            .trim();
    } catch (e) {
        // If it finds vulns, `npm audit` will exit with a non-zero exit code, causing `execFileSync()` to fail. That's
        // ok, we don't care about that.
        // However, now we need to grab the process output from the exception object. -.-
        output = e.stdout.toString().trim();
    }

    try {
        const audit_result = JSON.parse(output);
        return {
            metadata: audit_result.metadata,
            advisories: audit_result.advisories,
        };
    } catch (e) {
        return false;
    }
};

module.exports = { audit };
