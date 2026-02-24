import { program } from "commander";
import pkg from '../package.json';

const args = process.argv.slice(3);

program
    .name('chord')
    .description('CLI de DisChord')
    .version(`DisChord CLI v${pkg.version}`, '-v, --version', 'Muestra la versión actual')
    .helpOption('-h, --help', 'Muestra la ayuda del comando');

program.parse(process.argv);