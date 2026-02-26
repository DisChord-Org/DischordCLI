import fs from 'fs';
import path from 'path';
import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';

export default async function compile (arg: string) {
    if (!fs.existsSync(arg)) return console.log(red('No existe esa ruta.'));

    const resolvedPath = path.resolve(arg);
    const isDirectory = fs.statSync(resolvedPath).isDirectory();
    const dir = isDirectory ? resolvedPath : path.join(resolvedPath, '..');
    const baseDir = path.basename(dir);

    if (baseDir != 'src') return console.log(red(`No se ha encontrado la carpeta src.`) + '\nSe encontró ' + gray(`'${baseDir}'`) + '\nEn ' + gray(resolvedPath));

    const fileName = path.basename(resolvedPath);
    const extension = path.extname(fileName);

    if (extension != '.chord') return console.log(red(`Se esperaba una extensión '.chord'`) + '\nSe encontró ' + gray(`'${extension}'`) + '\nEn ' + gray(fileName));

    Commander.run({
        windows: `dischord_compiler ${resolvedPath} --no-run`,
        linux: `dischord_compiler ${resolvedPath} --no-run`
    });
}