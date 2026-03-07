import semver from 'semver';
import Requester from './requester';
import pkg from '../../package.json';
import { gray, green, red, yellow } from './drawer';
import homedir from './homedir';
import fs from 'fs';
import { execSync } from 'child_process';
import Commander from './commander';

export function updateAvailable(current: string, latest: string): 'up-to-date' | 'update-available' {
    if (semver.eq(current, latest)) return 'up-to-date';

    return semver.gt(current, latest)? 'up-to-date' : 'update-available';
}

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

// Ejecución
setupWindowsPath();