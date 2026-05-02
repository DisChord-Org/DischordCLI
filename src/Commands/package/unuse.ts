import path from 'path';
import fs from 'fs';

import { red, gray, bold } from "../../Utils/drawer";

/**
 * Unlinks a library from the current project by removing its symbolic link.
 * 
 * This function reverses `pkgUse` by deleting the link in the local `./lib` folder.
 * If the folder becomes empty, it is also removed to maintain project cleanliness.
 * 
 * @async
 * @param {string} name - The name of the library to unlink.
 * @returns {Promise<void>}
 */
export default async function pkgUnuse(name: string): Promise<void> {
    const projectLibDir = path.join(process.cwd(), 'lib');
    const targetPath = path.join(projectLibDir, name);

    if (!fs.existsSync(targetPath)) return console.log(red(`La librería ${bold(name)} no está vinculada en este proyecto.`));

    try {
        const stats = fs.lstatSync(targetPath);
        
        if (stats.isSymbolicLink() || stats.isFile()) fs.unlinkSync(targetPath);
        else fs.rmSync(targetPath, { recursive: true, force: true });

        console.log(`\n${red('- Unlinked:')} ${bold(name)} de ./lib/${name}`);

        if (fs.readdirSync(projectLibDir).length === 0) {
            fs.rmSync(projectLibDir, { recursive: true, force: true });
            console.log(gray(`Directorio ./lib eliminado.`));
        }

        console.log("");
    } catch (error: any) {
        console.log(red(`\nError al desvincular la librería: ${error.message}`));
    }
}