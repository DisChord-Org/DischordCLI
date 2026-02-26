import fs from 'fs';
import path from 'path';
import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';
import compile from './compile';

export default async function run (arg: string) {
    const NodeTest: boolean = Commander.test({
        windows: 'node -v',
        linux: 'same'
    });

    if (!NodeTest) {
        return console.log(red('ERROR: ') + 'Node.js no está instalado o no se encuentra en el PATH.\n' + gray('Es necesario Node.js para ejecutar el bot de DisChord.'));
    }

    await compile(arg);

    const resolvedPath = path.resolve(arg);
    const isDirectory = fs.statSync(resolvedPath).isDirectory();
    const dir = isDirectory ? resolvedPath : path.join(resolvedPath, '..');
    const baseDir = path.basename(dir);

    if (baseDir != 'src') return console.log(red(`No se ha encontrado la carpeta src.`) + '\nSe encontró ' + gray(`'${baseDir}'`) + '\nEn ' + gray(resolvedPath));

    const dist = path.join(dir, '../', 'dist');
    if (!fs.existsSync(dist)) return console.log(red('No se ha encontrado la carpeta dist.') + '\nSe encontró ' + gray(`'${path.basename(dist)}'`) + '\nEn ' + gray(dist));

    const indexPath = path.join(dist, 'index.mjs');
    if (!fs.existsSync(indexPath)) return console.log(red('No se ha encontrado el archivo index.mjs en la carpeta dist.') + '\nSe encontró ' + gray(`'${path.basename(indexPath)}'`) + '\nEn ' + gray(indexPath));

    Commander.run({
        windows: `cd "${path.join(dist, '../')}" & node "${indexPath}"`,
        linux: 'same'
    }, { stdio: 'inherit' });
}