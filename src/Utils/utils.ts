import semver from 'semver';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

import pkg from '../../package.json';
import { gray, green, red, yellow } from './drawer';

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
 * Orchestrates the update check process for both the Compiler and the CLI.
 * It fetches remote versions and compares them against local metadata and package files.
 * @async
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

/**
 * Ensures the DisChord binary folder is present in the Windows User PATH environment variable.
 * This function uses 'reg query' to read and 'setx' to write to the Windows Registry.
 * Only executes if the current OS is Windows.
 * @returns {void}
 */
export function setupWindowsPath(): void {
    if (!Commander.isWindows) return;

    try {
        const currentPath = execSync('reg query HKCU\\Environment /v PATH', { encoding: 'utf8' });
        
        const pathMatch = currentPath.match(/PATH\s+REG_SZ\s+(.*)/);
        const pathValue = pathMatch ? pathMatch[1] : '';

        if (!pathValue.includes(homedir._BinFolder)) {
            execSync(`setx PATH "${pathValue};${homedir._BinFolder}"`);
            console.log(green('Ruta añadida al PATH con éxito.'));
            console.log(yellow('Nota:') + ' Reinicia tu terminal para ver los cambios.');
        }
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