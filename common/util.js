// Merge arrays `a` and `b`, discarding items from `b` with a `prop` that already exists in `a`.
// Taken from: https://stackoverflow.com/a/41919138
const merge = (a, b, prop) => a.filter((aa) => !b.find((bb) => aa[prop] === bb[prop])).concat(b);

// Remove duplicate array elements by key.
// Adapted after: https://stackoverflow.com/a/36744732
const uniqueByKey = (arr, key) =>
    arr.filter((el, index, self) => !el[key] || index === self.findIndex((e) => e[key] === el[key]));

// Returns `true` if the intersection of arrays `a` and `b` is not empty.
// Taken from: https://www.geeksforgeeks.org/how-to-find-if-two-arrays-contain-any-common-item-in-javascript/
const haveCommonElements = (a, b) => a.some((item) => b.includes(item));

// Find the nearest file (i.e. the one with the fewest slashes, starting from `dir` and descending recursively into
// child directories) matching `file_glob` in `dir`.
const findNearestFile = (file_glob, dir, also_find_directories = false) => {
    const glob = require('glob');

    const matches = glob.sync(`**/${file_glob}`, {
        cwd: dir,
        absolute: true,
        nodir: !also_find_directories,
    });
    return matches.reduce((acc, cur) => {
        return characterOccurrencesInString('/', cur) < characterOccurrencesInString('/', acc) ? cur : acc;
    }, undefined);
};

// Count the occurrences of `char` in `str`.
// Adapted after: https://stackoverflow.com/a/10671743
const characterOccurrencesInString = (char, str) =>
    typeof str !== 'string' ? Infinity : (str.match(new RegExp(char, 'g')) || []).length;

// Internal function, use downloadFile() instead.
const _downloadFile = async (url, path) => {
    const { DownloaderHelper } = require('node-downloader-helper');

    const dl = new DownloaderHelper(url, path, {
        retry: { maxRetries: 3, delay: 500 },
        override: true,
    });
    const res = new Promise((resolve, reject) => {
        dl.on('end', resolve);
        dl.on('error', reject);
    });
    dl.start();
    return res;
};
// Download the file at `url` to the folder `path` and return the path of the downloaded file.
const downloadFile = async (url, path) => {
    let dl_error = false;
    const { filePath: dl_path } =
        (await _downloadFile(url, path).catch((e) => {
            console.log(e);
            dl_error = true;
        })) || {};
    if (dl_error) return false;
    return dl_path;
};

// Identify the mime type of the file at `file_path`.
const identifyFile = (file_path) => {
    const path = require('path');
    const child_process = require('child_process');

    // Try matching by file extension first. That is of course not a reliable method but speed is more important here.
    const KNOWN_EXTENSIONS = {
        '.appimage': 'application/vnd.appimage',
        '.deb': 'application/vnd.debian.binary-package',
        '.gz': 'application/gzip',
        '.zip': 'application/zip',
        '.xz': 'application/x-xz',
        '.tar': 'application/x-tar',
        '.exe': 'application/x-dosexec',
    };
    const extension = path.extname(file_path).toLowerCase();
    if (Object.keys(KNOWN_EXTENSIONS).includes(extension)) return KNOWN_EXTENSIONS[extension];

    // If we cannot match the file extension, we delegate to the `file` command.
    return child_process
        .execFileSync('file', ['-b', '--mime-type', file_path], {
            env: {},
            timeout: 1000,
        })
        .toString()
        .trim();
};

module.exports = {
    merge,
    uniqueByKey,
    haveCommonElements,
    findNearestFile,
    characterOccurrencesInString,
    downloadFile,
    identifyFile,
};
