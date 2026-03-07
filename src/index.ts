import { Argument, Option, program } from "commander";
import pkg from '../package.json';
import init from "./Commands/init";
import update from "./Commands/update";
import compile from "./Commands/compile";
import run from "./Commands/run";
import './Utils/homedir';

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
        new Argument('<componente>', 'Componente a actualizar')
            .choices([ 'cli', 'compiler', 'all' ])
            .argRequired()
    )
    .addOption(
        new Option('-f, --force', 'Forzar actualización ignorando versiones').default(false, 'no forzar')
    )
    .action((args, options) => update(args, options));

program
    .command('compile')
    .description('Compila un fichero .chord')
    .addArgument(new Argument('<ruta>', 'Ruta del proyecto').argRequired())
    .action((args) => compile(args));

program
    .command('run')
    .description('Ejecuta un proyecto de DisChord')
    .addArgument(new Argument('<ruta>', 'Ruta del proyecto').argRequired())
    .action((args) => run(args));

program.parse(process.argv);