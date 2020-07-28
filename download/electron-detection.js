const { findNearestFile, haveCommonElements } = require('../common/util');
const path = require('path');
const fs = require('fs');
const rpj = require('read-package-json-fast');
const detective = require('detective');

const findPackageJson = (dir) => findNearestFile('package.json', dir);

const isExtractedElectron = async (dir) => {
    // Find the package root folder by looking for the 'nearest' (i.e. the one with the fewest slashes) `package.json`.
    const package_json_path = findPackageJson(dir);
    if (package_json_path) {
        console.log('Found package.json:', package_json_path);
        const package_folder = path.dirname(package_json_path);

        let error = false;
        const pjson_data = await rpj(package_json_path).catch((e) => {
            console.log(e);
            error = true;
        });
        if (error) return false;

        // First, check the `package.json` for Electron-related dependencies as that is a fairly fast operation.
        // We consider all possible types of dependencies.
        const dependency_types = [
            'dependencies',
            'devDependencies',
            'peerDependencies',
            'optionalDependencies',
            'bundledDependencies',
        ];

        const dependencies = dependency_types.reduce((acc, cur) => {
            return [...acc, ...Object.keys(pjson_data[cur] || {})];
        }, []);
        // The extracted ASARs tend not to actually have `electron` in their `package.json`, so we also consider other
        // dependencies typically used with Electron.
        if (dependencies.some((d) => d.match(/^electron/))) return package_folder;
        console.log("Didn't find Electron-related dependency.");

        // If that doesn't work, try to find the entry point and check if that module requires `electron`.
        const entry_point = pjson_data.main;
        if (entry_point) {
            console.log("Found module entry point, checking for require('electron'):", entry_point);
            // This is a very greedy way of finding the entry point. If the proper one is specified and exists, this
            // should find it. Otherwise, we may be lucky and still find it or we may well find something else. That is
            // fine, though.
            const entry_point_file =
                findNearestFile(entry_point, package_folder) || findNearestFile(entry_point + '*', package_folder);
            if (entry_point_file && fs.existsSync(entry_point_file)) {
                const entry_point_src = fs.readFileSync(entry_point_file);
                if (entry_point_src) {
                    const requires = detective(entry_point_src);
                    if (requires.includes('electron')) return package_folder;
                }
            }
        }
    }

    return false;
};

module.exports = { isExtractedElectron };
