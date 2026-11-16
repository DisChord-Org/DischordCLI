import { Argument, Option, program } from 'commander';

import pkg from '../package.json';
import homedir from './Utils/homedir';
import LibraryLocalManager from './Utils/libraries/LibraryLocalManager';
import { ensureBinFolderOnPath } from './Utils/pathSetup';
import { red } from './Utils/drawer';
import { errorMessage, fail, markFailed } from './Utils/output';

import init from './Commands/init';
import update from './Commands/update';
import compile from './Commands/compile';
import run from './Commands/run';
import pkgInstall from './Commands/package/install';
import pkgSearch from './Commands/package/search';
import pkgUninstall from './Commands/package/uninstall';
import pkgUse from './Commands/package/use';
import pkgUnuse from './Commands/package/unuse';
import pkgSync from './Commands/package/sync';

/**
 * Main Entry Point for the DisChord CLI.
 * This file configures the 'chord' command using the Commander.js library,
 * defining the global options, subcommands, and their respective action handlers.
 */

/** A command implementation: resolves to false when the command did not succeed. */
type CommandHandler<Args extends unknown[]> = (...args: Args) => boolean | Promise<boolean>;

/**
 * Wraps a command implementation into a Commander action handler with uniform failure
 * handling: a command that reports failure or throws makes the process exit with a non-zero
 * code, and an unexpected exception is printed as a one-line error instead of a stack trace.
 * @template Args - The arguments Commander passes to the action.
 * @param {CommandHandler<Args>} handler - The command implementation.
 * @returns {(...args: Args) => Promise<void>} The action handler to register.
 */
function action<Args extends unknown[]> (handler: CommandHandler<Args>): (...args: Args) => Promise<void> {
    return async (...args: Args): Promise<void> => {
        try {
            if (!(await handler(...args))) markFailed();
        } catch (error) {
            fail(red('ERROR: ') + errorMessage(error));
        }
    };
}

/**
 * Builds the '--json' option shared by every command that can report to external integrations.
 * @param {string} [description] - The help text of the option.
 * @returns {Option} A fresh option instance.
 */
function jsonOption (description: string = 'Salida en NDJSON para integraciones como DisChord Code Studio'): Option {
    return new Option('--json', description).default(false, 'salida legible para humanos');
}

/**
 * Builds the '--allow-unsigned' option shared by the commands that can install packages.
 * @returns {Option} A fresh option instance.
 */
function allowUnsignedOption (): Option {
    return new Option('--allow-unsigned', 'Instala sin pedir confirmación paquetes sin firmar o de origen no verificado (obligatorio con --json)').default(false, 'pedir confirmación');
}

/**
 * One-time environment preparation, done explicitly here instead of as an import side effect:
 * creates the DisChord folders and registers the binary folder in the user's PATH.
 */
homedir.ensureDirectories();
LibraryLocalManager.ensureStorage();
ensureBinFolderOnPath();

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
    .action(action((projectPath: string) => init(projectPath)));

/**
 * Subcommand: update
 * Manages updates for the CLI, Compiler, or both.
 * Includes a --force option to bypass version comparison, and a --json
 * option that switches the output to NDJSON (one JSON object per line)
 * for external integrations such as DisChord Code Studio.
 * Usage: chord update <cli|compiler|all> [-f] [--json]
 */
program
    .command('update')
    .description('Actualiza la CLI, el Compilador o ambos.')
    .addArgument(
        new Argument('<componente>', 'Componente a actualizar')
            .choices(['cli', 'compiler', 'all'])
            .argRequired()
    )
    .addOption(new Option('-f, --force', 'Forzar actualización ignorando versiones').default(false, 'no forzar'))
    .addOption(jsonOption())
    .action(action((target: 'cli' | 'compiler' | 'all', options: { force: boolean, json: boolean }) => update(target, options)));

/**
 * Subcommand: compile
 * Triggers the transpilation of a .chord source file into JavaScript.
 * Usage: chord compile <ruta>
 */
program
    .command('compile')
    .description('Compila un fichero .chord')
    .addArgument(new Argument('<ruta>', 'Ruta del fichero .chord, o del proyecto para compilar su src/index.chord').argRequired())
    .action(action((sourcePath: string) => compile(sourcePath)));

/**
 * Subcommand: run
 * Executes a DisChord project (compiles and then starts the Node.js process).
 * Usage: chord run <ruta>
 */
program
    .command('run')
    .description('Ejecuta un proyecto de DisChord')
    .addArgument(new Argument('<ruta>', 'Ruta del fichero .chord, o del proyecto para ejecutar su src/index.chord').argRequired())
    .action(action((sourcePath: string) => run(sourcePath)));

/**
 * Command Group: pkg
 * Parent command for DisChord package management operations.
 */
const pkgCommand = program
    .command('pkg')
    .description('Gestiona las librerías de DisChord');

/**
 * Subcommand: pkg install
 * Downloads and installs one or more DisChord libraries globally. Includes a --json option
 * that switches the output to NDJSON (one JSON object per line) for external
 * integrations such as DisChord Code Studio, mirroring 'chord update --json', and an
 * --allow-unsigned option to accept unsigned packages without the interactive confirmation.
 * Usage: chord pkg install <nombre[@version]...> [--json] [--allow-unsigned]
 */
pkgCommand
    .command('install')
    .description('Instala una librería de DisChord')
    .addArgument(new Argument('<packages...>', 'Paquetes a instalar, como nombre o nombre@version').argRequired())
    .addOption(jsonOption())
    .addOption(allowUnsignedOption())
    .action(action((packages: string[], options: { json: boolean, allowUnsigned: boolean }) => pkgInstall(packages, options)));

/**
 * Subcommand: pkg uninstall
 * Permanently removes a specific version of a library from the global storage.
 * Includes a --json option that emits a single NDJSON result event for external
 * integrations such as DisChord Code Studio.
 * Usage: chord pkg uninstall <nombre> <version> [--json]
 */
pkgCommand
    .command('uninstall')
    .description('Elimina una librería globalmente')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addArgument(new Argument('<version>', 'Versión a borrar').argRequired())
    .addOption(jsonOption())
    .action(action((name: string, version: string, options: { json: boolean }) => pkgUninstall(name, version, options)));

/**
 * Subcommand: pkg search
 * Queries the official registry or local storage for available libraries.
 * Includes a --json option that prints the results as a single JSON array of
 * packages for external integrations such as DisChord Code Studio, instead of
 * the colorized text blocks meant for humans.
 * Usage: chord pkg search [query] [-i] [--json]
 */
pkgCommand
    .command('search')
    .description('Busca librerías disponibles en el registro oficial')
    .addArgument(new Argument('[query]', 'Término de búsqueda'))
    .addOption(new Option('-i, --installed', 'Forzar la búsqueda local').default(false, 'no forzar'))
    .addOption(jsonOption('Salida en JSON para integraciones como DisChord Code Studio'))
    .action(action((query: string | undefined, options: { installed: boolean, json: boolean }) => pkgSearch(query, options)));

/**
 * Subcommand: pkg use
 * Creates a symbolic link (junction on Windows) of a specific library version
 * into the current project's /lib directory. Includes a --json option that
 * emits a single NDJSON result event for external integrations such as
 * DisChord Code Studio.
 * Usage: chord pkg use <nombre> <version> [--json]
 */
pkgCommand
    .command('use')
    .description('Implementa en tu proyecto actual la librería especificada')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addArgument(new Argument('<version>', 'Versión a la que cambiar').argRequired())
    .addOption(jsonOption())
    .action(action((name: string, version: string, options: { json: boolean }) => pkgUse(name, version, options)));

/**
 * Subcommand: pkg unuse
 * Removes the symbolic link of a library from the current project's /lib directory.
 * Includes a --json option that emits a single NDJSON result event for external
 * integrations such as DisChord Code Studio.
 * Usage: chord pkg unuse <nombre> [--json]
 */
pkgCommand
    .command('unuse')
    .description('Elimina de tu proyecto actual la librería especificada')
    .addArgument(new Argument('<nombre>', 'Nombre del paquete').argRequired())
    .addOption(jsonOption())
    .action(action((name: string, options: { json: boolean }) => pkgUnuse(name, options)));

/**
 * Subcommand: pkg sync
 * Restores every package declared in the project's 'dischord.lock.conf' lock file:
 * installs any that are missing globally and links them into './lib', skipping
 * ones already in place. Mirrors 'npm install' / 'pip install -r requirements.txt'.
 * Includes a --json option for external integrations such as DisChord Code Studio.
 * Usage: chord pkg sync [--json] [--allow-unsigned]
 */
pkgCommand
    .command('sync')
    .description('Instala y enlaza en tu proyecto todos los paquetes declarados en dischord.lock.conf')
    .addOption(jsonOption())
    .addOption(allowUnsignedOption())
    .action(action((options: { json: boolean, allowUnsigned: boolean }) => pkgSync(options)));

/**
 * Process the raw command-line arguments provided by the user.
 */
await program.parseAsync(process.argv);
