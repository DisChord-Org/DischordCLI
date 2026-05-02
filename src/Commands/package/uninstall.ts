import path from 'path';
import fs from 'fs';
import { red, bold, gray } from "../../Utils/drawer";
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';

export default async function pkgUninstall(name: string, version: string): Promise<void> {
    const packagePath = path.join(LibraryLocalManager.LibrariesPath, name);

    if (!fs.existsSync(packagePath)) return console.log(red(`El paquete ${bold(name)} no está instalado.`));

    const versionPath = path.join(packagePath, version);

    if (!fs.existsSync(versionPath)) return console.log(red(`La versión ${bold(version)} de ${bold(name)} no está instalada.`));

    fs.rmSync(versionPath, { recursive: true, force: true });

    if (fs.readdirSync(packagePath).length === 0) fs.rmSync(packagePath, { recursive: true, force: true });

    console.log(`\n${bold(red('- ') + name)} ${gray(version)}\n`);
}