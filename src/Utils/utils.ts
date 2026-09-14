import semver from 'semver';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import boxen from 'boxen';
import cliProgress from 'cli-progress';

import pkg from '../../package.json';
import { cyan, gray, green, red, yellow } from './drawer';

import Requester from './requester';
import homedir from './homedir';
import Commander from './commander';

/**
 * Compares two version strings to determine if an update is required.
 * @param current The version currently installed in the system.
 * @param latest The latest version available in the remote repository.
 * @returns {'up-to-date' | 'update-available'} The status of the version comparison.
 */
export function updateAvailable(current: string, latest: string): 'up-to-date' | 'update-available' {
    if (semver.eq(current, latest)) return 'up-to-date';

    return semver.gt(current, latest)? 'up-to-date' : 'update-available';
}

/**
 * Formats and returns a boxed notification for a new version release.
 * @param version The new version string.
 */
export function printNewVersionAvailableMessage(version: string, verbose: boolean = false): void {
    const message = `Nueva versión disponible: ${gray('v' + version)}${verbose?
       `\n${yellow('Ejecuta')} ${cyan('chord update all')} ${yellow('to update.')}` : ''
    }`

    console.log(createBox(message));
}

/**
 * Wraps a message string inside a styled CLI box using the boxen library.
 * @param {string} message The text content to be displayed in the box.
 * @returns {string} The formatted string with borders and padding.
 */
export function createBox (message: string): string {
    return boxen(message, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        dimBorder: false,
        textAlignment: 'center'
    });
}

/**
 * Orchestrates the update check process for both the Compiler and the CLI.
 * It fetches remote versions and compares them against local metadata and package files.
 * @async
 * @deprecated
 */
export async function checkUpdates() {
    const versions = await Requester.getVersions();
    const CurrentCompilerVersion = fs.readFileSync(homedir.getVersionPath('compiler'), 'utf-8');

    if (updateAvailable(CurrentCompilerVersion, versions.compiler) === 'update-available') {
        console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + versions.compiler)}.\n${gray('Por favor, actualiza tu Compilador.')}`);
    }

    if (updateAvailable(pkg.version, versions.cli) === 'update-available') {
        console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + versions.cli)}.\n${gray('Por favor, actualiza tu CLI.')}`);
    }
}

export function createDownloadProgressBar(resourceName: string): { bar: cliProgress.SingleBar, handleProgress: any } {
    const progressBar = new cliProgress.SingleBar({
        format: `${gray('Descargando')} ${cyan(resourceName)} |` + '{bar}' + `| {percentage}% | {value}/{total} MB`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        stopOnComplete: true,
        barsize: Math.floor(process.stdout.columns * 0.4) 
    }, cliProgress.Presets.shades_classic);

    let started = false;

    const handleProgress = (p: { total: number, transferred: number }) => {
        if (!started) {
            progressBar.start(Number((p.total / 1024 / 1024).toFixed(2)), 0);
            started = true;
        }
        progressBar.update(Number((p.transferred / 1024 / 1024).toFixed(2)));
    };

    return {
        bar: progressBar,
        handleProgress
    };
}

/**
 * Ensures the DisChord binary folder is present in the Windows User PATH environment variable.
 * This function uses 'reg query' to read and 'setx' to write to the Windows Registry.
 * Only executes if the current OS is Windows.
 * @returns {void}
 */
export function setupWindowsPath(): void {
    if (!Commander.isWindows) return;

    /**
     * The existing value's type (REG_SZ or REG_EXPAND_SZ - the latter is what Windows uses by
     * default whenever PATH is edited through the system GUI). The previous version of this
     * function only matched 'REG_SZ' literally, so an EXPAND_SZ-typed PATH silently failed to
     * parse, pathValue fell back to '', and the write below replaced the user's entire PATH
     * with just the DisChord bin folder. Also preserve the original type on write instead of
     * always writing REG_SZ, so any %VAR%-style references in the existing value keep expanding.
     */
    let pathValue = '';
    let valueType = 'REG_SZ';

    try {
        const queryOutput = execSync('reg query HKCU\\Environment /v PATH', { encoding: 'utf8' });
        const pathMatch = queryOutput.match(/PATH\s+(REG_(?:EXPAND_)?SZ)\s+(.*)/);
        if (pathMatch) {
            valueType = pathMatch[1];
            pathValue = pathMatch[2].trim();
        }
    } catch {
        // No existing HKCU PATH value - we'll create one below instead of leaving it unset.
    }

    if (pathValue.includes(homedir._BinFolder)) return;

    try {
        // 'reg add' is used instead of 'setx', which silently truncates values over 1024 characters.
        const newValue = pathValue ? `${pathValue};${homedir._BinFolder}` : homedir._BinFolder;
        execSync(`reg add "HKCU\\Environment" /v PATH /t ${valueType} /d "${newValue}" /f`);
        console.log(green('Ruta añadida al PATH con éxito.'));
        console.log(yellow('Nota:') + ' Reinicia tu terminal para ver los cambios.');
    } catch (error) {
        console.error(red('Error al modificar el PATH:'), error instanceof Error ? error.message : error);
    }
}

/**
 * Ensures the DisChord binary folder is present in the MACOS User PATH environment vairable.
 * Modifies ~/.zshrc (by default in MacOS) or ~/.bashrc.
 * @returns {void}
 */
export function setupUnixPath(): void {
    if (!Commander.isMacOS) return;

    try {
        const binFolder = homedir._BinFolder;
        const exportLine = `export PATH="$PATH:${binFolder}"`;
        
        const zshrc = path.join(homedir._homedir, '.zshrc');
        const bashrc = path.join(homedir._homedir, '.bashrc');
        const targetFile = fs.existsSync(zshrc) ? zshrc : bashrc;

        /**
         * Maybe zshrc and bashrc does not exists
         */
        if (!fs.existsSync(targetFile)) throw new Error(red('ERROR FATAL: ') + 'No se ha encontrado .zshrc ni .bashrc');

        const currentContent = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';

        if (!currentContent.includes(binFolder)) {
            fs.appendFileSync(targetFile, `\n# DisChord CLI path\n${exportLine}\n`);
            
            console.log(green('Ruta añadida al archivo de configuración de la shell: ') + gray(targetFile));
            console.log(yellow('IMPORTANTE: ') + 'Para usar los comandos ahora mismo, ejecuta: ' + yellow(`source ${targetFile}`));
        }
    } catch (error) {
        console.error(red('Error al modificar el PATH en Unix:'), error instanceof Error ? error.message : error);
    }
}


/**
 * Immediate execution of environment setup.
*/
setupWindowsPath();
setupUnixPath();