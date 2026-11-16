import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

import Commander from './commander';
import homedir from './homedir';
import { gray, green, red, yellow } from './drawer';
import { errorMessage, warn } from './output';

/**
 * Registration of the DisChord binary folder in the user's PATH, so 'chord' and
 * 'dischord-compiler' can be invoked by name from any terminal.
 *
 * Every message here goes to stderr: this runs before any command, and stdout must stay
 * clean for the command's own output (NDJSON events in --json mode).
 */

/** Registry key holding the current user's environment variables on Windows. */
const WINDOWS_ENVIRONMENT_KEY = 'HKCU\\Environment';

/**
 * Normalizes a PATH entry so two spellings of the same folder compare equal.
 * @param {string} entry - A single PATH entry.
 * @returns {string} The entry without quotes or trailing separators, lowercased on Windows.
 */
function normalizePathEntry (entry: string): string {
    const cleaned = entry.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');

    return Commander.isWindows ? cleaned.toLowerCase() : cleaned;
}

/**
 * Checks whether a PATH-like value already lists a folder.
 * @param {string | undefined} pathValue - The PATH value to inspect.
 * @param {string} folder - The folder to look for.
 * @param {string} [delimiter] - The separator between entries. Defaults to the platform's own.
 * @returns {boolean} True if one of the entries is that folder.
 */
export function pathContains (pathValue: string | undefined, folder: string, delimiter: string = path.delimiter): boolean {
    if (!pathValue) return false;

    const target = normalizePathEntry(folder);

    return pathValue.split(delimiter).some(entry => normalizePathEntry(entry) === target);
}

/**
 * Expands '%NAME%' references the way Windows does for REG_EXPAND_SZ values.
 * @param {string} value - The raw value, possibly holding '%NAME%' references.
 * @returns {string} The value with every known variable replaced.
 */
function expandWindowsVariables (value: string): string {
    return value.replace(/%([^%]+)%/g, (reference, name: string) => process.env[name] ?? reference);
}

/**
 * Adds the DisChord binary folder to the Windows user PATH stored in the registry.
 *
 * 'reg' is invoked directly, without a shell: a shell would expand any '%VAR%' reference of
 * the existing value before it is written back, freezing it. The value's type (REG_SZ or
 * REG_EXPAND_SZ - the latter is what Windows uses whenever PATH is edited through the system
 * GUI) is preserved for the same reason. 'reg add' is used instead of 'setx', which silently
 * truncates values over 1024 characters.
 * @returns {void}
 */
function setupWindowsPath (): void {
    let pathValue = '';
    let valueType = 'REG_SZ';

    const query = spawnSync('reg', ['query', WINDOWS_ENVIRONMENT_KEY, '/v', 'PATH'], { encoding: 'utf8', windowsHide: true });

    // a failed query means there is no user PATH value yet; one is created below.
    if (query.status === 0) {
        const pathMatch = query.stdout.match(/PATH\s+(REG_(?:EXPAND_)?SZ)\s+(.*)/);

        if (pathMatch) {
            valueType = pathMatch[1];
            pathValue = pathMatch[2].trim();
        }
    }

    if (pathContains(expandWindowsVariables(pathValue), homedir.binDir, ';')) return;

    const newValue = pathValue ? `${pathValue.replace(/;+$/, '')};${homedir.binDir}` : homedir.binDir;
    const add = spawnSync('reg', ['add', WINDOWS_ENVIRONMENT_KEY, '/v', 'PATH', '/t', valueType, '/d', newValue, '/f'], { encoding: 'utf8', windowsHide: true });

    if (add.status !== 0) {
        warn(red('Error al modificar el PATH: ') + (add.error?.message ?? add.stderr.trim()));
        return;
    }

    warn(green('Ruta añadida al PATH con éxito.'));
    warn(yellow('Nota:') + ' Abre una terminal nueva para ver los cambios. Si sigue sin reconocer el comando, cierra sesión y vuelve a entrar.');
}

/**
 * Picks the shell configuration file the PATH export should be appended to, based on the
 * user's login shell and on which files already exist.
 * @returns {string} The absolute path to the configuration file to modify.
 */
function resolveShellConfigFile (): string {
    const zshrc = path.join(homedir.home, '.zshrc');
    const bashrc = path.join(homedir.home, '.bashrc');
    const shell = path.basename(process.env.SHELL ?? '');

    if (shell === 'zsh') return zshrc;
    if (shell === 'bash') return bashrc;
    if (fs.existsSync(zshrc)) return zshrc;
    if (fs.existsSync(bashrc)) return bashrc;

    // no known shell and no existing file: zsh is the default on macOS, '.profile' is read by most login shells elsewhere.
    return Commander.isMacOS ? zshrc : path.join(homedir.home, '.profile');
}

/**
 * Adds the DisChord binary folder to the PATH on Linux and macOS by appending an export line
 * to the user's shell configuration file (created if it does not exist).
 * @returns {void}
 */
function setupUnixPath (): void {
    try {
        const targetFile = resolveShellConfigFile();
        const currentContent = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';

        if (currentContent.includes(homedir.binDir)) return;

        fs.appendFileSync(targetFile, `\n# DisChord CLI path\nexport PATH="$PATH:${homedir.binDir}"\n`);

        warn(green('Ruta añadida al archivo de configuración de la shell: ') + gray(targetFile));
        warn(yellow('IMPORTANTE: ') + 'Para usar los comandos ahora mismo, ejecuta: ' + yellow(`source ${targetFile}`));
    } catch (error) {
        warn(red('Error al modificar el PATH: ') + errorMessage(error));
    }
}

/**
 * Ensures the DisChord binary folder is registered in the user's PATH.
 * Does nothing (and touches neither the registry nor any file) when the folder is already
 * part of the PATH of the running process, which is the case on every run after the first.
 * @returns {void}
 */
export function ensureBinFolderOnPath (): void {
    if (pathContains(process.env.PATH, homedir.binDir)) return;

    if (Commander.isWindows) setupWindowsPath();
    else setupUnixPath();
}
