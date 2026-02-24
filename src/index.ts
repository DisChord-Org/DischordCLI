import { program } from "commander";
import pkg from '../package.json';
import Requester from "./Utils/requester";
import semver from 'semver';
import { yellow, green, gray } from './Utils/drawer';

(async () => {
    const version = await Requester.getVersion('cli');

    if (semver.gt(version.version, pkg.version)) {
        console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + version.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
    }

    if (version.critical) throw new Error('Se requiere actualización para continuar el uso.');
})();

program
    .name('chord')
    .description('CLI de DisChord')
    .version(`DisChord CLI v${pkg.version}`, '-v, --version', 'Muestra la versión actual')
    .helpOption('-h, --help', 'Muestra la ayuda del comando');

program.parse(process.argv);