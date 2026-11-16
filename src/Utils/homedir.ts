import path from 'path';
import os from 'os';
import fs from 'fs';

import Commander from './commander';

/** Components whose installed version is tracked in a '<component>-version' file. */
export type VersionedComponent = 'cli' | 'compiler' | 'ide';

/** Executables managed by the CLI inside the binary folder. */
export type ManagedBinary = 'chord' | 'dischord-compiler';

/**
 * Resolves the local filesystem layout used by DisChord: the configuration root, the folder
 * holding the executables, the version files and the Node.js toolchain bundled by the IDE.
 *
 * Constructing this class only computes paths; nothing is created on disk until
 * {@link HomeDirectory.ensureDirectories} is called explicitly by the CLI entry point.
 * @class HomeDirectory
 */
class HomeDirectory {
    /** The current user's home directory. */
    public readonly home: string = os.homedir();
    /** The root directory for DisChord data (~/.dischord). */
    public readonly root: string = path.join(this.home, '.dischord');
    /**
     * The directory where the executables are stored:
     * '~/.dischord/bin' on Windows, '~/.local/bin' on Linux and macOS.
     */
    public readonly binDir: string = Commander.isWindows
        ? path.join(this.root, 'bin')
        : path.join(this.home, '.local', 'bin');

    /**
     * Creates the DisChord root and binary folders if they do not exist yet.
     * @returns {void}
     */
    public ensureDirectories (): void {
        this.ensureDirectory(this.root);
        this.ensureDirectory(this.binDir);
    }

    /**
     * Creates a directory (and its missing parents) if it does not exist yet.
     * @param {string} directory - The directory to create.
     * @returns {void}
     */
    public ensureDirectory (directory: string): void {
        fs.mkdirSync(directory, { recursive: true });
    }

    /**
     * Resolves the full path to a component's version file.
     * @param {VersionedComponent} component - The component to resolve.
     * @returns {string} The absolute path to the version file.
     */
    public getVersionPath (component: VersionedComponent): string {
        return path.join(this.root, `${component}-version`);
    }

    /**
     * Checks if a component's version file exists.
     * @param {VersionedComponent} component - The component to check.
     * @returns {boolean} True if the version file is found.
     */
    public existsVersion (component: VersionedComponent): boolean {
        return fs.existsSync(this.getVersionPath(component));
    }

    /**
     * Resolves the full path to a managed executable, adding '.exe' on Windows.
     * @param {ManagedBinary} component - The executable to resolve.
     * @returns {string} The absolute path to the executable.
     */
    public getBinaryPath (component: ManagedBinary): string {
        const ext = Commander.isWindows ? '.exe' : '';
        return path.join(this.binDir, `${component}${ext}`);
    }

    /**
     * Checks if a managed executable exists on this system.
     * @param {ManagedBinary} component - The executable to check.
     * @returns {boolean} True if the executable exists.
     */
    public existsBinary (component: ManagedBinary): boolean {
        return fs.existsSync(this.getBinaryPath(component));
    }

    /**
     * Resolves the directory holding the Node.js/pnpm toolchain bundled by the DisChord IDE
     * (downloaded next to the CLI/compiler binaries, under the same bin folder), so it can be
     * prepended to a child process' PATH. This differs by OS because Node's own official
     * distribution layout differs: Unix ships its executables under a 'bin' subfolder, while
     * Windows ships them flat at the toolchain root alongside '.cmd' shims.
     * @returns {string} The absolute path to the folder containing 'node'/'pnpm' (and friends).
     */
    public getNodeToolchainBinDir (): string {
        const nodeDir = path.join(this.binDir, 'node');
        return Commander.isWindows ? nodeDir : path.join(nodeDir, 'bin');
    }

    /**
     * Checks whether the DisChord IDE's bundled Node.js/pnpm toolchain is present on this
     * system. When absent (ej. the CLI is used standalone, without the IDE), callers should
     * fall back to whatever 'pnpm'/'node' is available on the system's own PATH.
     * @returns {boolean} True if the bundled toolchain's bin folder exists.
     */
    public hasNodeToolchain (): boolean {
        return fs.existsSync(this.getNodeToolchainBinDir());
    }

    /**
     * Resolves the full path to the bundled toolchain's own 'node' executable, so it can be
     * invoked directly (ej. to run the compiled bot) instead of relying on whatever 'node' is
     * first on the system's PATH.
     * @returns {string} The absolute path to the bundled 'node'/'node.exe' binary.
     */
    public getNodeBinaryPath (): string {
        const filename = Commander.isWindows ? 'node.exe' : 'node';
        return path.join(this.getNodeToolchainBinDir(), filename);
    }
}

/** Singleton instance of the home directory resolver. */
const homedir = new HomeDirectory();

export default homedir;
