import path from 'path';
import fs from 'fs';

import homedir from "../homedir";
import { PackageResponse, PackagesRecordResponse, TrustLevel } from './types';
import { bold, cyan, gray, green, italic, red } from '../drawer';

/**
 * Manages the local storage and retrieval of DisChord libraries.
 * Responsible for handling the 'libraries' directory within the DisChord home folder,
 * checking for existing installations, and formatting library metadata for the CLI.
 * @class LibraryLocalManager
 */
class LibraryLocalManager {
    /** 
     * The absolute path to the local libraries' storage directory.
     * @type {string}
     */
    public static LibrariesPath: string = path.join(homedir._DisChordRoot, 'libraries');

    /**
     * Initializes the manager and ensures the local libraries directory exists.
     * Uses the homedir utility to verify and create the storage path if necessary.
     */
    constructor () {
        homedir.checkPath(LibraryLocalManager.LibrariesPath, 'folder');
    }

    /**
     * Formats a package response into a stylized string for terminal output.
     * Includes the package name, version, description, repository URL, and trust/audit status.
     * @param {PackageResponse} repo - The package data to format.
     * @returns {string} A colorized and formatted string ready for the console.
     */
    public static toString (repo: PackageResponse): string {
        return `+ ${green(`${repo.name} (${repo.version})`)} ${bold('-')} ${italic(gray(repo.description))}\n    - ${cyan(repo.repository)}\n    - ${cyan(TrustLevel[repo.trustLevel])}\n    - ${repo.isAudited? cyan('Firmado') : red('Sin firmar')}`;
    }

    /**
     * Checks if a specific package or a specific version of a package is already installed locally.
     * @param {string} name - The name of the package.
     * @param {string} [version] - Optional specific version to check.
     * @returns {boolean} True if the repository path exists on the filesystem.
     */
    public static existsRepo (name: PackageResponse['name'], version: PackageResponse['version'] | undefined = undefined): boolean {
        if (version) return fs.existsSync(path.join(LibraryLocalManager.LibrariesPath, name, version));
        return fs.existsSync(path.join(LibraryLocalManager.LibrariesPath, name));
    }

    /**
     * Scans the local libraries directory and reconstructs the installed packages record.
     * Reads the 'data.json' file from each package's root directory to retrieve metadata.
     * @static
     * @returns {PackagesRecordResponse} A map of installed packages indexed by their name.
     * @throws {Error} If a 'data.json' file is missing or contains invalid JSON.
     */
    static getPackages (): PackagesRecordResponse {
        const librariesRecord: PackagesRecordResponse = {};
        
        fs.readdirSync(this.LibrariesPath).map(file => {
            const library = JSON.parse(fs.readFileSync(path.join(this.LibrariesPath, file, 'data.json'), 'utf8')) as PackageResponse
            librariesRecord[library.name] = library;
        });

        return librariesRecord;
    }

    /**
     * Removes a specific package or version of a package from the local storage.
     * @param name The name of the package to remove.
     * @param version The version of the package to remove.
     */
    static removePackage (name: string, version: PackageResponse['version']) {
        const packagePath = path.join(this.LibrariesPath, name);
        const packageVersionPath = path.join(packagePath, version);
        const packageDataPath = path.join(packagePath, 'data.json');

        if (fs.existsSync(packageVersionPath)) fs.rmSync(packageVersionPath, { recursive: true, force: true });
        if (fs.existsSync(packageDataPath)) fs.rmSync(packageDataPath);
        if (fs.readdirSync(packagePath).length === 0) fs.rmSync(packagePath, { recursive: true, force: true });
    }
}

/**
 * Singleton-like initialization to ensure the libraries' path is verified on startup.
 */
new LibraryLocalManager();

export default LibraryLocalManager;