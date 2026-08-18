import fs from 'fs';
import path from 'path';
import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';
import homedir from '../Utils/homedir';


/**
 * Orchestrates the compilation process for a Chord file.
 * It performs structural validation of the project (ensuring it's within a 'src' directory)
 * and invokes the underlying dischord-compiler binary.
 * @param {string} arg - The relative or absolute path to the .chord file to be compiled.
 * @param {string} [outDir] - Optional destination directory for the compiled output, forwarded
 * to the compiler's '-o' flag. Defaults to the compiler's own default ('./dist' relative to the
 * project root) when omitted, preserving the existing 'chord compile' CLI behaviour. Callers that
 * need the compiled '.js' next to its '.chord' source (ej. installed packages, where transpiled
 * TypeScript is also emitted next to its source) should pass that source file's directory.
 * @returns {Promise<void>} A promise that resolves when the validation and execution are complete.
 */
export default async function compile (arg: string, outDir?: string) {
    if (!fs.existsSync(arg)) return console.log(red('No existe esa ruta.'));

    const resolvedPath = path.resolve(arg);
    const isDirectory = fs.statSync(resolvedPath).isDirectory();
    const dir = isDirectory ? resolvedPath : path.join(resolvedPath, '..');
    const baseDir = path.basename(dir);

    if (baseDir != 'src') return console.log(red(`No se ha encontrado la carpeta src.`) + '\nSe encontró ' + gray(`'${baseDir}'`) + '\nEn ' + gray(resolvedPath));

    const fileName = path.basename(resolvedPath);
    const extension = path.extname(fileName);

    if (extension != '.chord') return console.log(red(`Se esperaba una extensión '.chord'`) + '\nSe encontró ' + gray(`'${extension}'`) + '\nEn ' + gray(fileName));

    const outDirFlag = outDir ? ` -o ${outDir}` : '';

    /**
     * Execute the compiler binary using the Commander utility.
     * The --no-run flag is used to ensure the file is only transpiled, not executed immediately.
     */
    Commander.run({
        windows: `${homedir.getBinaryPath('dischord-compiler')} ${resolvedPath} --no-run${outDirFlag}`,
        linux: `dischord-compiler ${resolvedPath} --no-run${outDirFlag}`,
        macos: `dischord-compiler ${resolvedPath} --no-run${outDirFlag}`
    });
}