import path from 'path';
import fs from 'fs';

import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';

import { red, green, gray, bold } from "../../Utils/drawer";
import Commander from '../../Utils/commander';

/**
 * Links a specific version of a globally installed library to the current project's local directory.
 * 
 * This function creates a symbolic link (or a junction on Windows) inside the `./lib` folder 
 * of the project, pointing to the source files in the DisChord global storage. This allows 
 * the transpiler to access library components without duplicating files across projects.
 * 
 * @async
 * @param {string} name - The unique name of the library to use.
 * @param {string} version - The specific version tag to link.
 * @throws {Error} If the symbolic link creation fails due to missing permissions or OS restrictions.
 * @returns {Promise<void>}
 */
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