const { findNearestFile, identifyFile } = require('../common/util');
const path = require('path');
const { extractFull } = require('node-7z');

// prettier-ignore
const P7ZIP_TYPES = ['application/vnd.appimage', 'application/vnd.debian.binary-package', 'application/gzip', 'application/zip',
'application/x-xz', 'application/x-tar'];
const SUPPORTED_TYPES = [...P7ZIP_TYPES];

const extractFullPromise = async (archive, output, options) => {
    const a = extractFull(archive, output, options);
    return new Promise((resolve, reject) => {
        a.on('end', resolve);
        a.on('error', reject);
    });
};

const extract = async (file_path, mime_type, dest_dir) => {
    console.log('Extracting', file_path, 'to', dest_dir);
    // TODO: Currently, this obviously handles everything. In the future, we might want to add other extractors than
    // p7zip which would then become the else statement.
    if (P7ZIP_TYPES.includes(mime_type) || true) {
        let err = false;
        await extractFullPromise(file_path, dest_dir).catch((e) => {
            err = true;
            console.log(e);
        });
        if (err) return false;

        // Many of the archives contain additional archives themselves, which we also need to extract.

        const findAndExtract = async (glob) => {
            const match = findNearestFile(glob, dest_dir);
            if (match) {
                return await extract(
                    match,
                    identifyFile(match),
                    path.join(dest_dir, path.basename(match) + '_extracted')
                );
            }
        };

        switch (mime_type) {
            // GZIP and XZ archives usually contain a tarball.
            case 'application/gzip':
            case 'application/x-xz':
                const tarball_extracted = await findAndExtract('*.tar');
                if (tarball_extracted) return tarball_extracted;
                break;
            // DEBs contain a `control.tar.gz` and a `data.tar.*`, the latter being the one we are interested in.
            case 'application/vnd.debian.binary-package':
                const data_archive_extracted = await findAndExtract('data.*');
                if (data_archive_extracted) return data_archive_extracted;
                break;
            // If we manage to extract an EXE, it can contain all kinds of stuff.
            case 'application/x-dosexec':
                const nupkg_extracted = await findAndExtract('*.nupkg');
                if (nupkg_extracted) return nupkg_extracted;

                // NSIS installers contain a folder `$PLUGINSDIR` with the actual app archive inside.
                const nsis_extracted = await findAndExtract('$PLUGINSDIR/*.7z');
                if (nsis_extracted) return nsis_extracted;
                break;
        }

        return dest_dir;
    }

    return false;
};

module.exports = { P7ZIP_TYPES, extract };
