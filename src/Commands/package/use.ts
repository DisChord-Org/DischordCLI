import path from 'path';
import fs from 'fs';

import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';

import { red, green, gray, bold } from "../../Utils/drawer";
import Commander from '../../Utils/commander';

export default async function pkgUse(name: string, version: string): Promise<void> {
    const sourcePath = path.join(LibraryLocalManager.LibrariesPath, name, version);
    const projectLibDir = path.join(process.cwd(), 'lib');
    const targetPath = path.join(projectLibDir, name);

    if (!fs.existsSync(sourcePath)) return console.log(red(`${bold(`${name}@${version}`)} no está instalada.`));
    if (!fs.existsSync(projectLibDir)) fs.mkdirSync(projectLibDir, { recursive: true });

    if (fs.existsSync(targetPath)) {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink() || stats.isFile()) fs.unlinkSync(targetPath);
        else fs.rmSync(targetPath, { recursive: true, force: true });
    }

    try {
        fs.symlinkSync(sourcePath, targetPath, Commander.isWindows ? 'junction' : 'dir');

        console.log(`\n${green('Linked:')} ${bold(name)} (${version}) -> ./lib/${name}`);
    } catch (error: any) {
        console.log(red(`\nError al crear el enlace simbólico: ${error.message}`));
        if (Commander.isWindows) console.log(gray("Tip: En Windows, activa el 'Modo Desarrollador' o ejecuta como Admin."));
    }
}