import fs from 'fs';
import path from 'path';

import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';
import homedir from '../Utils/homedir';
import ProjectManifest from '../Utils/ProjectManifest';
import { errorMessage, fail } from '../Utils/output';

/** Name of the directory every '.chord' source file must live in. */
const SOURCE_DIR_NAME = 'src';
/** Extension of DisChord source files. */
const CHORD_EXTENSION = '.chord';
/** Entry file looked up when a project directory is given instead of a file. */
const ENTRY_FILE_NAME = `index${CHORD_EXTENSION}`;

/** Locations derived from a valid '.chord' source file. */
export interface ChordSource {
    /** Absolute path to the '.chord' file. */
    filePath: string;
    /** Absolute path to the 'src' directory containing it. */
    sourceDir: string;
    /** Absolute path to the project root (the parent of 'src'). */
    projectRoot: string;
}

/**
 * Error thrown when a path cannot be used as a '.chord' compilation target. Its message is
 * already formatted for the terminal.
 * @class ChordSourceError
 * @extends Error
 */
export class ChordSourceError extends Error {
    /**
     * @param {string} message - The formatted explanation of what is wrong with the path.
     */
    constructor (message: string) {
        super(message);
        this.name = 'ChordSourceError';
    }
}

/**
 * Resolves and validates the '.chord' file a command should work with.
 * Accepts either the file itself, or a directory: a project root (resolved to its
 * 'src/index.chord') or a 'src' directory (resolved to its 'index.chord').
 * @param {string} arg - The relative or absolute path given by the user.
 * @throws {ChordSourceError} If the path does not exist, is not a '.chord' file, or is not
 * located directly inside a 'src' directory.
 * @returns {ChordSource} The resolved source file and its project locations.
 */
export function resolveChordSource (arg: string): ChordSource {
    let filePath = path.resolve(arg);

    if (!fs.existsSync(filePath)) throw new ChordSourceError(red('No existe esa ruta.') + '\nEn ' + gray(filePath));

    if (fs.statSync(filePath).isDirectory()) {
        filePath = path.basename(filePath) === SOURCE_DIR_NAME
            ? path.join(filePath, ENTRY_FILE_NAME)
            : path.join(filePath, SOURCE_DIR_NAME, ENTRY_FILE_NAME);

        if (!fs.existsSync(filePath)) throw new ChordSourceError(red(`No se ha encontrado el fichero ${ENTRY_FILE_NAME} del proyecto.`) + '\nEn ' + gray(filePath));
    }

    const extension = path.extname(filePath);
    if (extension !== CHORD_EXTENSION) {
        throw new ChordSourceError(red(`Se esperaba una extensión '${CHORD_EXTENSION}'`) + '\nSe encontró ' + gray(`'${extension}'`) + '\nEn ' + gray(path.basename(filePath)));
    }

    const sourceDir = path.dirname(filePath);
    if (path.basename(sourceDir) !== SOURCE_DIR_NAME) {
        throw new ChordSourceError(red('No se ha encontrado la carpeta src.') + '\nSe encontró ' + gray(`'${path.basename(sourceDir)}'`) + '\nEn ' + gray(filePath));
    }

    return { filePath, sourceDir, projectRoot: path.dirname(sourceDir) };
}

/**
 * Invokes the dischord-compiler binary on a single '.chord' file, without running the result
 * ('--no-run'). Uses the binary managed by the CLI when it is installed, and falls back to
 * whatever 'dischord-compiler' is on the system's PATH otherwise.
 * @param {string} filePath - Absolute path to the '.chord' file to compile.
 * @param {string} [outDir] - Destination directory for the compiled output, forwarded to the
 * compiler's '-o' flag. Defaults to the compiler's own default ('./dist' relative to the project root).
 * @throws {CommandError} If the compiler cannot be started or reports a failure.
 * @returns {void}
 */
export function runCompiler (filePath: string, outDir?: string): void {
    const compiler = homedir.existsBinary('dischord-compiler') ? homedir.getBinaryPath('dischord-compiler') : 'dischord-compiler';
    const args = [filePath, '--no-run'];

    if (outDir) args.push('-o', outDir);

    Commander.exec(compiler, args);
}

/**
 * Orchestrates the compilation process for a Chord file.
 * It performs structural validation of the project (ensuring the file is within a 'src'
 * directory), ensures the project itself is valid to run (a 'package.json' with
 * '"type": "module"', and its dependencies installed - see {@link ProjectManifest}), and
 * invokes the underlying dischord-compiler binary.
 * @async
 * @param {string} arg - The relative or absolute path to the '.chord' file to be compiled, or
 * to a project directory (see {@link resolveChordSource}).
 * @param {string} [outDir] - Optional destination directory for the compiled output. Defaults
 * to the compiler's own default ('./dist' relative to the project root) when omitted.
 * @returns {Promise<boolean>} True if the file was compiled, false if validation or compilation
 * failed (the reason is printed to stderr and the process is marked as failed).
 */
export default async function compile (arg: string, outDir?: string): Promise<boolean> {
    let source: ChordSource;

    try {
        source = resolveChordSource(arg);
    } catch (error) {
        if (!(error instanceof ChordSourceError)) throw error;

        fail(error.message);
        return false;
    }

    try {
        /**
         * Structural validation done, now validate the project is actually runnable: it needs an
         * ESM 'package.json' (generated via 'pnpm init' if missing) and its dependencies installed.
         */
        ProjectManifest.ensure(source.projectRoot);

        if (!fs.existsSync(path.join(source.projectRoot, 'node_modules'))) {
            console.error(gray('Instalando dependencias del proyecto...'));
            ProjectManifest.install(source.projectRoot);
        }

        runCompiler(source.filePath, outDir);
        return true;
    } catch (error) {
        fail(red('ERROR: ') + `No se pudo compilar ${path.basename(source.filePath)}.\n` + gray(errorMessage(error)));
        return false;
    }
}
