import fs from 'fs';
import path from 'path';

import Commander from '../commander';

/**
 * Filesystem helpers for the links 'chord pkg use' creates inside a project's './lib' folder
 * (symbolic links on Unix, junctions on Windows).
 *
 * Everything here inspects the link itself rather than what it points to, so a link whose
 * target has disappeared (ej. the package was uninstalled globally) is still detected and
 * can be replaced or removed.
 */

/**
 * Checks whether anything exists at a path, without following links.
 * @param {string} targetPath - The path to check.
 * @returns {boolean} True if a file, directory or link (even a broken one) exists there.
 */
export function entryExists (targetPath: string): boolean {
    return fs.lstatSync(targetPath, { throwIfNoEntry: false }) !== undefined;
}

/**
 * Tells whether a path is a link (symbolic link or junction) rather than a real file or directory.
 * Besides asking the filesystem, it compares the path with its resolved location, so a
 * junction is recognized even if the runtime does not report it as a symbolic link.
 * @param {string} targetPath - The path to inspect.
 * @returns {boolean} True if the path is a link, including a broken one.
 */
export function isLink (targetPath: string): boolean {
    const stats = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (!stats) return false;
    if (stats.isSymbolicLink()) return true;

    try {
        const parent = fs.realpathSync(path.dirname(targetPath));
        const resolved = fs.realpathSync(targetPath);
        const literal = path.join(parent, path.basename(targetPath));

        // Windows paths are case-insensitive, and realpath reports the casing stored on disk.
        return Commander.isWindows ? resolved.toLowerCase() !== literal.toLowerCase() : resolved !== literal;
    } catch {
        return false;
    }
}

/**
 * Tells whether a link points to the given directory.
 * @param {string} linkPath - The path of the link.
 * @param {string} expectedTarget - The directory the link is expected to resolve to.
 * @returns {boolean} True if both resolve to the same location. False for broken links.
 */
export function linkPointsTo (linkPath: string, expectedTarget: string): boolean {
    try {
        return fs.realpathSync(linkPath) === fs.realpathSync(expectedTarget);
    } catch {
        return false;
    }
}

/**
 * Removes whatever exists at a path. Links are removed without ever touching the directory
 * they point to; real directories are removed recursively.
 * @param {string} targetPath - The path to remove.
 * @returns {void}
 */
export function removeEntry (targetPath: string): void {
    const stats = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (!stats) return;

    if (isLink(targetPath) || !stats.isDirectory()) {
        try {
            fs.unlinkSync(targetPath);
        } catch {
            // some runtimes refuse to unlink a directory junction; removing it as an empty directory never follows it.
            fs.rmdirSync(targetPath);
        }
        return;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
}

/**
 * Creates a directory link (a junction on Windows, which needs no special privileges).
 * @param {string} sourceDir - The existing directory the link will point to.
 * @param {string} linkPath - The path of the link to create.
 * @returns {void}
 */
export function createDirectoryLink (sourceDir: string, linkPath: string): void {
    fs.symlinkSync(sourceDir, linkPath, Commander.isWindows ? 'junction' : 'dir');
}
