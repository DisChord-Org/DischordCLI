import path from 'path';
import fs from 'fs';

import homedir from '../homedir';
import { type PackageResponse, type PackagesRecordResponse } from './types';
import { compareVersionTags, formatPackage } from './formatPackage';
import { assertValidPackageName, assertValidVersionTag, isValidPackageName, isValidVersionTag, resolveInside } from './validation';

/**
 * Error thrown when a package version is already being installed by another running process.
 * @class InstallInProgressError
 * @extends Error
 */
export class InstallInProgressError extends Error {
    /**
     * @param {string} name - The package name.
     * @param {string} version - The version tag being installed.
     */
    constructor (name: string, version: string) {
        super(`Ya hay otra instalación de ${name}@${version} en curso.`);
        this.name = 'InstallInProgressError';
    }
}

/**
 * Manages the global, per-user storage of installed DisChord libraries.
 *
 * Layout, under '~/.dischord/libraries':
 *   <name>/data.json                         Metadata of the newest installed version.
 *   <name>/<version>/                        The files of one installed version.
 *   <name>/<version>/.dischord-package.json  Metadata of that specific version.
 *   <name>/<version>/.installing             Present only while that version is being installed.
 *
 * A version counts as installed when its directory exists and holds no '.installing' marker,
 * so an installation that was interrupted halfway is never mistaken for a complete one.
 * @class LibraryLocalManager
 */
class LibraryLocalManager {
    /**
     * The absolute path to the local libraries' storage directory.
     * @type {string}
     */
    public static LibrariesPath: string = path.join(homedir.root, 'libraries');

    /** Name of the per-package metadata file, describing the newest installed version. */
    private static readonly PACKAGE_DATA_FILE = 'data.json';
    /** Name of the per-version metadata file, stored inside each version directory. */
    private static readonly VERSION_DATA_FILE = '.dischord-package.json';
    /** Name of the marker file holding the PID of the process installing a version. */
    private static readonly INSTALL_MARKER_FILE = '.installing';
    /** Files created by the operating system that must not count as package content. */
    private static readonly IGNORED_ENTRIES: readonly string[] = ['.DS_Store'];

    /** Versions ('name@version') this very process is currently installing. */
    private static readonly activeInstalls = new Set<string>();

    /**
     * Creates the local libraries directory if it does not exist yet.
     * @returns {void}
     */
    public static ensureStorage (): void {
        homedir.ensureDirectory(LibraryLocalManager.LibrariesPath);
    }

    /**
     * Resolves the root directory of a package, holding all of its installed versions.
     * @param {string} name - The package name.
     * @throws {InvalidPackageReferenceError} If the name is not a valid package name.
     * @returns {string} The absolute path to the package directory.
     */
    public static getPackageDir (name: string): string {
        assertValidPackageName(name);
        return resolveInside(LibraryLocalManager.LibrariesPath, name);
    }

    /**
     * Resolves the directory of a specific version of a package.
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @returns {string} The absolute path to the version directory.
     */
    public static getVersionDir (name: string, version: string): string {
        assertValidVersionTag(version);
        return resolveInside(LibraryLocalManager.getPackageDir(name), version);
    }

    /**
     * Formats an installed package into a stylized string for terminal output.
     * @param {PackageResponse} repo - The package data to format.
     * @returns {string} A colorized and formatted string ready for the console.
     */
    public static toString (repo: PackageResponse): string {
        return formatPackage(repo, LibraryLocalManager.getLocalVersionFolders(repo.name), () => true);
    }

    /**
     * Checks if a package, or a specific version of it, is installed locally. A version that is
     * still being installed (or whose installation was interrupted) is not considered installed.
     * @param {string} name - The name of the package.
     * @param {string} [version] - Optional specific version to check.
     * @returns {boolean} True if it is installed. False for invalid names or versions.
     */
    public static existsRepo (name: PackageResponse['name'], version?: PackageResponse['version']): boolean {
        if (!isValidPackageName(name)) return false;
        if (version === undefined) return fs.existsSync(LibraryLocalManager.getPackageDir(name));
        if (!isValidVersionTag(version)) return false;

        const versionDir = LibraryLocalManager.getVersionDir(name, version);

        return fs.existsSync(versionDir) && !fs.existsSync(path.join(versionDir, LibraryLocalManager.INSTALL_MARKER_FILE));
    }

    /**
     * Tells whether this very process is in the middle of installing a version. Used to break
     * dependency cycles: a package that is still being installed can already be linked into
     * the packages that depend on it.
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @returns {boolean} True if the current process is installing that version.
     */
    public static isInstallActive (name: string, version: string): boolean {
        return LibraryLocalManager.activeInstalls.has(`${name}@${version}`);
    }

    /**
     * Claims a version directory for installation by creating it together with its
     * '.installing' marker. Leftovers from an installation that died halfway are discarded.
     * @param {string} name - The package name.
     * @param {string} version - The version tag to install.
     * @throws {InstallInProgressError} If another running process is installing that version.
     * @throws {Error} If the version is already installed.
     * @returns {string} The absolute path to the claimed version directory.
     */
    public static beginInstall (name: string, version: string): string {
        const versionDir = LibraryLocalManager.getVersionDir(name, version);
        const markerPath = path.join(versionDir, LibraryLocalManager.INSTALL_MARKER_FILE);

        if (fs.existsSync(versionDir)) {
            if (!fs.existsSync(markerPath)) throw new Error(`${name}@${version} ya está instalado.`);

            const owner = Number.parseInt(fs.readFileSync(markerPath, 'utf8'), 10);
            if (owner !== process.pid && LibraryLocalManager.isProcessAlive(owner)) throw new InstallInProgressError(name, version);

            fs.rmSync(versionDir, { recursive: true, force: true });
        }

        fs.mkdirSync(versionDir, { recursive: true });

        try {
            fs.writeFileSync(markerPath, String(process.pid), { encoding: 'utf8', flag: 'wx' });
        } catch (error) {
            // another process created the marker between our check and our write.
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new InstallInProgressError(name, version);
            throw error;
        }

        LibraryLocalManager.activeInstalls.add(`${name}@${version}`);

        return versionDir;
    }

    /**
     * Marks a claimed version as fully installed: persists its metadata, removes the
     * '.installing' marker and refreshes the package-level 'data.json'.
     * @param {string} name - The package name.
     * @param {string} version - The version tag that finished installing.
     * @param {PackageResponse} metadata - The registry data of the installed version.
     * @returns {void}
     */
    public static completeInstall (name: string, version: string, metadata: PackageResponse): void {
        const versionDir = LibraryLocalManager.getVersionDir(name, version);

        fs.writeFileSync(path.join(versionDir, LibraryLocalManager.VERSION_DATA_FILE), JSON.stringify(metadata), 'utf8');
        fs.rmSync(path.join(versionDir, LibraryLocalManager.INSTALL_MARKER_FILE), { force: true });

        LibraryLocalManager.activeInstalls.delete(`${name}@${version}`);
        LibraryLocalManager.refreshPackageData(name);
    }

    /**
     * Discards a claimed version whose installation failed or was cancelled.
     * @param {string} name - The package name.
     * @param {string} version - The version tag that was being installed.
     * @returns {void}
     */
    public static abortInstall (name: string, version: string): void {
        LibraryLocalManager.activeInstalls.delete(`${name}@${version}`);
        LibraryLocalManager.removePackage(name, version);
    }

    /**
     * Scans the local libraries directory and reconstructs the installed packages record.
     * Reads the 'data.json' file from each package's root directory to retrieve metadata.
     * Entries that are not directories (ej. Finder's '.DS_Store', stray files), directories without
     * a 'data.json', and entries whose 'data.json' is unreadable or invalid are skipped.
     * @returns {PackagesRecordResponse} A map of installed packages indexed by their name.
     */
    public static getPackages (): PackagesRecordResponse {
        const librariesRecord: PackagesRecordResponse = {};

        if (!fs.existsSync(LibraryLocalManager.LibrariesPath)) return librariesRecord;

        for (const entry of fs.readdirSync(LibraryLocalManager.LibrariesPath)) {
            const dataPath = path.join(LibraryLocalManager.LibrariesPath, entry, LibraryLocalManager.PACKAGE_DATA_FILE);

            try {
                if (!fs.statSync(path.join(LibraryLocalManager.LibrariesPath, entry)).isDirectory()) continue;
                if (!fs.statSync(dataPath).isFile()) continue;

                const library = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as PackageResponse;
                if (library && typeof library.name === 'string') librariesRecord[library.name] = library;
            } catch {
                continue;
            }
        }

        return librariesRecord;
    }

    /**
     * Removes a specific version of a package from the local storage. The package-level
     * 'data.json' is refreshed to describe the newest version left, and the whole package
     * directory is removed once no version remains.
     * @param {string} name - The name of the package.
     * @param {string} version - The version tag to remove.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @returns {void}
     */
    public static removePackage (name: string, version: PackageResponse['version']): void {
        const packageDir = LibraryLocalManager.getPackageDir(name);
        const versionDir = LibraryLocalManager.getVersionDir(name, version);

        fs.rmSync(versionDir, { recursive: true, force: true });

        if (LibraryLocalManager.getLocalVersionFolders(name).length > 0) {
            LibraryLocalManager.refreshPackageData(name);
            return;
        }

        fs.rmSync(path.join(packageDir, LibraryLocalManager.PACKAGE_DATA_FILE), { force: true });

        /**
         * Ignore '.DS_Store' when deciding whether the package root is empty. Finder creates
         * this file silently in any folder it has browsed (ej. the user opened the DisChord
         * libraries folder in Finder), so on macOS it was making this check see a 'non-empty'
         * folder forever, leaving an orphaned package directory behind after every version was
         * removed - which in turn made 'existsRepo(name)' keep reporting the package as installed.
         */
        if (!fs.existsSync(packageDir)) return;

        const remainingEntries = fs.readdirSync(packageDir).filter(entry => !LibraryLocalManager.IGNORED_ENTRIES.includes(entry));
        if (remainingEntries.length === 0) fs.rmSync(packageDir, { recursive: true, force: true });
    }

    /**
     * Lists the fully installed versions of a package found on disk. Directories that are not
     * named after a valid version tag, or that are still being installed, are left out.
     * @param {string} name - The name of the package to scan.
     * @returns {string[]} The installed version tags. Empty for invalid or unknown packages.
     */
    public static getLocalVersionFolders (name: PackageResponse['name']): PackageResponse['version'][] {
        if (!isValidPackageName(name)) return [];

        const packageDir = LibraryLocalManager.getPackageDir(name);
        if (!fs.existsSync(packageDir)) return [];

        return fs.readdirSync(packageDir).filter(entry => LibraryLocalManager.existsRepo(name, entry));
    }

    /**
     * Rewrites a package's 'data.json' so it describes the newest version currently installed,
     * instead of whichever version happened to be installed last. Falls back to patching the
     * existing 'data.json' for versions installed before per-version metadata existed.
     * @param {string} name - The name of the package to refresh.
     * @returns {void}
     */
    public static refreshPackageData (name: string): void {
        const newestVersion = LibraryLocalManager.getLocalVersionFolders(name).sort(compareVersionTags).pop();
        if (!newestVersion) return;

        const packageDataPath = path.join(LibraryLocalManager.getPackageDir(name), LibraryLocalManager.PACKAGE_DATA_FILE);
        const versionDataPath = path.join(LibraryLocalManager.getVersionDir(name, newestVersion), LibraryLocalManager.VERSION_DATA_FILE);

        const versionData = LibraryLocalManager.readMetadata(versionDataPath);
        const packageData = LibraryLocalManager.readMetadata(packageDataPath);
        const metadata = versionData ?? (packageData ? { ...packageData, version: newestVersion } : undefined);

        if (metadata) fs.writeFileSync(packageDataPath, JSON.stringify(metadata), 'utf8');
    }

    /**
     * Reads a package metadata file, tolerating missing or corrupt files.
     * @param {string} filePath - The absolute path to the metadata file.
     * @returns {PackageResponse | undefined} The parsed metadata, or undefined if unavailable.
     * @private
     */
    private static readMetadata (filePath: string): PackageResponse | undefined {
        try {
            const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageResponse;
            return metadata && typeof metadata.name === 'string' ? metadata : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Checks whether a process with the given PID is currently running.
     * @param {number} pid - The process identifier to probe.
     * @returns {boolean} True if the process exists (even if owned by another user).
     * @private
     */
    private static isProcessAlive (pid: number): boolean {
        if (!Number.isInteger(pid) || pid <= 0) return false;

        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            // EPERM means the process exists but we are not allowed to signal it.
            return (error as NodeJS.ErrnoException).code === 'EPERM';
        }
    }
}

export default LibraryLocalManager;
