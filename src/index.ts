import { Argument, Option, program } from "commander";

import pkg from '../package.json';
import './Utils/homedir';
import "./Utils/utils";

import init from "./Commands/init";
import update from "./Commands/update";
import compile from "./Commands/compile";
import run from "./Commands/run";
import pkgInstall from "./Commands/package/install";
import pkgSearch from "./Commands/package/search";
import pkgUninstall from "./Commands/package/uninstall";
import pkgUse from "./Commands/package/use";
import pkgUnuse from "./Commands/package/unuse";

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

const pkgCommand = program
    .command('pkg')
    .description('Gestiona las librerías de DisChord');

pkgCommand
    .command('install')
    .description('Instala una librería de DisChord')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addArgument(new Argument('[version]', 'Versión específica (por defecto latest)'))
    .action((name, version) => pkgInstall(name, version));

pkgCommand
    .command('uninstall')
    .description('Elimina una librería globalmente')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addArgument(new Argument('<version>', 'Versión a borrar').argRequired())
    .action((name, version) => pkgUninstall(name, version));

pkgCommand
    .command('search')
    .description('Busca librerías disponibles en el registro oficial')
    .addArgument(new Argument('[query]', 'Término de búsqueda'))
    .addOption(
        new Option('-i, --installed', 'Forzar la búsqueda local').default(false, 'no forzar')
    )
    .action((query, options) => pkgSearch(query, options));

pkgCommand
    .command('use')
    .description('Implementa en tu proyecto actual la librería especificada')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addArgument(new Argument('<version>', 'Versión a la que cambiar').argRequired())
    .action((name, version) => pkgUse(name, version));

pkgCommand
    .command('unuse')
    .description('Elimina de tu proyecto actual la librería especificada')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .action((name) => pkgUnuse(name));

/**
 * Process the raw command-line arguments provided by the user.
 */
program.parse(process.argv);