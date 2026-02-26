import { Argument, program } from "commander";
import pkg from '../package.json';
import Requester from "./Utils/requester";
import { yellow, green, gray } from './Utils/drawer';
import { updateAvailable } from "./Utils/utils";
import init from "./Commands/init";
import update from "./Commands/update";
import compile from "./Commands/compile";
import './Utils/homedir';

(async () => {
    const version = await Requester.getVersion('cli');

    if (updateAvailable(pkg.version, version.version) === 'update-available') {
        console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + version.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
    }

    if (version.critical) throw new Error('Se requiere actualización para continuar el uso.');
})();

program
    .name('chord')
    .description('CLI de DisChord')
    .version(`DisChord CLI v${pkg.version}`, '-v, --version', 'Muestra la versión actual')
    .helpOption('-h, --help', 'Muestra la ayuda del comando');

program
    .command('init')
    .description('Inicializa un nuevo proyecto de DisChord')
    .addArgument(new Argument('<ruta>', 'Ruta donde se creará el proyecto').argRequired())
    .action((args) => init(args));

program
    .command('update')
    .description('Actualiza la CLI, IDE, Compilador o todo.')
    .addArgument(
        new Argument('<componente>', 'Componente a actualizar (cli, ide, compiler, all)')
            .choices([ 'cli', 'ide', 'compiler', 'all' ])
            .argRequired()
    )
    .action((args) => update(args));

program
    .command('compile')
    .description('Compila un fichero .chord')
    .addArgument(new Argument('<ruta>', 'Ruta del proyecto').argRequired())
    .action((args) => compile(args));

program.parse(process.argv);