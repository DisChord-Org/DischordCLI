import semver from 'semver';
import Requester from './requester';
import pkg from '../../package.json';
import { gray, green, yellow } from './drawer';
import homedir from './homedir';
import fs from 'fs';

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