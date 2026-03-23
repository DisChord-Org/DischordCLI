import { Argument, Option, program } from "commander";
import pkg from '../package.json';
import init from "./Commands/init";
import update from "./Commands/update";
import compile from "./Commands/compile";
import run from "./Commands/run";
import './Utils/homedir';
import "./Utils/utils";

/**
 * Main Entry Point for the DisChord CLI.
 * This file configures the 'chord' command using the Commander.js library,
 * defining the global options, subcommands, and their respective action handlers.
 */

program
    .name('chord')
    .description('CLI de DisChord')
    .version(`DisChord CLI v${pkg.version}`, '-v, --version', 'Muestra la versión actual')
    .helpOption('-h, --help', 'Muestra la ayuda del comando');

/**
 * Subcommand: init
 * Initializes a new DisChord project structure.
 * Usage: chord init <ruta>
 */
program
    .command('init')
    .description('Inicializa un nuevo proyecto de DisChord')
    .addArgument(new Argument('<ruta>', 'Ruta donde se creará el proyecto').argRequired())
    .action((args) => init(args));

/**
 * Subcommand: update
 * Manages updates for the CLI, Compiler, or the entire ecosystem.
 * Includes a --force option to bypass version comparison.
 * Usage: chord update <cli|compiler|all> [-f]
 */
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

/**
 * Subcommand: compile
 * Triggers the transpilation of a .chord source file into JavaScript.
 * Usage: chord compile <ruta>
 */
program
    .command('compile')
    .description('Compila un fichero .chord')
    .addArgument(new Argument('<ruta>', 'Ruta del proyecto').argRequired())
    .action((args) => compile(args));

/**
 * Subcommand: run
 * Executes a DisChord project (compiles and then starts the Node.js process).
 * Usage: chord run <ruta>
 */
program
    .command('run')
    .description('Ejecuta un proyecto de DisChord')
    .addArgument(new Argument('<ruta>', 'Ruta del proyecto').argRequired())
    .action((args) => run(args));

/**
 * Process the raw command-line arguments provided by the user.
 */
program.parse(process.argv);