import path from 'path';
import os from 'os';
import Commander from './commander';
import fs from 'fs';
import { gray, red, yellow } from './drawer';

/**
 * Utility class responsible for managing the local file system paths for DisChord.
 * It handles the creation and resolution of configuration directories and binary folders 
 * across different operating systems.
 */
class homedir {
    /** The current user's home directory path. */
    public _homedir: string = os.homedir();
    /** The root directory for DisChord configuration (~/.dischord). */
    public _DisChordRoot: string = path.join(this._homedir, '.dischord');
    /** The directory where executable binaries are stored. */
    public _BinFolder: string = this._homedir;

    /**
     * Initializes a new instance of the homedir class.
     * Sets up the appropriate binary folder path based on the OS and ensures base directories exist.
     */
    constructor () {
        // bins on:
        // windows: ~/.dischord/bin
        // linux: ~/.local/bin
        // macos: ~/.local/bin
        this._BinFolder = Commander.isWindows
            ? path.join(this._DisChordRoot, 'bin')
            : path.join(this._homedir, '.local', 'bin');

        this.checkPath(this._DisChordRoot, 'folder');
        this.checkPath(this._BinFolder, 'folder');
    }

    /**
     * Verifies if a path exists; if not, creates the required file or directory.
     * @param _path The system path to check.
     * @param type Whether the target should be a 'folder' or a 'file'.
     */
    public checkPath (_path: string, type: 'folder' | 'file') {
        if (!fs.existsSync(_path)) {
            console.log(yellow('ADVERTENCIA: ') + red(`No se encontró ${type == 'file'? 'el fichero' : 'la carpeta'} en tu sistema. Creando...`));
            if (type === 'file') {
                fs.writeFileSync(_path, '', 'utf-8');
            } else fs.mkdirSync(_path, { recursive: true });
            console.log(yellow('SOLUCIONADO: ') + red('Archivo creado en: ') + gray(_path));
        }
    }

    /**
     * Checks if a specific component's version file exists.
     * @param component The component to check (cli, compiler, or ide).
     * @returns True if the version file is found.
     */
    public existsVersion (component: 'cli' | 'compiler' | 'ide'): boolean {
        return fs.existsSync(path.join(this._DisChordRoot, `${component}-version`));
    }

    /**
     * Resolves the full path to a component's version file.
     * @param component The component to resolve.
     * @returns The absolute path to the version file.
     */
    public getVersionPath (component: 'cli' | 'compiler' | 'ide'): string {
        return path.join(this._DisChordRoot, `${component}-version`);
    }

    /**
     * Checks if a specific executable binary exists in the system.
     * Handles platform-specific extensions like .exe on Windows.
     * @param component The binary to check (chord or dischord-compiler).
     * @returns True if the binary exists.
     */
    public existsBinary (component: 'chord' | 'dischord-compiler'): boolean {
        const ext = Commander.isWindows ? '.exe' : '';
        return fs.existsSync(path.join(this._BinFolder, `${component}${ext}`));
    }

    /**
     * Resolves the full path to an executable binary.
     * @param component The binary to resolve.
     * @returns The absolute path to the binary.
     */
    public getBinaryPath(component: 'chord' | 'dischord-compiler'): string {
        const ext = Commander.isWindows ? '.exe' : '';
        return path.join(this._BinFolder, `${component}${ext}`);
    }
}

/** Singleton instance of the homedir manager. */
const hd = new homedir();
export default hd;