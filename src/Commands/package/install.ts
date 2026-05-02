import semver from 'semver';
import path from 'path';
import fs from 'fs';
import admZip from 'adm-zip';
import { terminal } from 'terminal-kit';

import Requester from "../../Utils/requester";
import Commander from '../../Utils/commander';
import LibraryAPIManager from '../../Utils/libraries/LibraryAPIManager';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';

import { red, green, gray, yellow, bold } from "../../Utils/drawer";
import { createBox, createDownloadProgressBar } from "../../Utils/utils";

const vRegex = /^v\d+\.\d+\.\d+$/;

export default async function pkgInstall(name: string, version: string = 'latest'): Promise<void> {
    if (version !== 'latest' && !vRegex.test(version) && !semver.valid(version)) {
        console.log(red(`El formato de versión "${version}" es inválido. Usa ${bold('vX.X.X')}`));
        return;
    }

    //if version is latest, we should get the upper local version
    if(LibraryLocalManager.existsRepo(name, version)) return console.log(`\n${bold(green('+ ') + name)} ${gray(version)}\n`);;

    console.log(gray(`Buscando ${bold(`${name}@${version}`)} en el registro...`));
    const pkg = await LibraryAPIManager.getPackage(name);

    if (!pkg) return console.log(red(`No se encontró el paquete ${bold(name)}.`));
    
    const packageBaseDir = path.join(LibraryLocalManager.LibrariesPath, name, pkg.version);
    const zipPath = path.join(packageBaseDir, `${name}-${pkg.version}.zip`);
    const sigPath = `${zipPath}.asc`;
    const { bar, handleProgress } = createDownloadProgressBar(`${name}@${pkg.version}`);

    await Requester.downloadFile(
        `${Requester.url}/packages/${name}/download`,
        zipPath,
        handleProgress
    );
    bar.stop();

    if (pkg.isAudited) {
        console.log(gray('Obteniendo firma...'));
        await Requester.downloadFile(
            `${Requester.url}/packages/${name}/sign/download`,
            `${zipPath}.asc`
        );

        console.log(gray('Verificando integridad del paquete...'));

        const signature = fs.readFileSync(sigPath, 'utf8');
        const isValid = await LibraryAPIManager.verifySignature(zipPath, signature);
        
        if (!isValid) {
            console.log(createBox(red('Firma no válida')));
            console.log(red('El archivo podría haber sido manipulado.'));
            console.log(bold(red('Posible Man In The Middle (MitM).')));
            console.log(red('Abortando instalación.'));

            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath);
            return;
        }

        console.log(gray('Firma verificada correctamente.'));
    } else {
        console.log(bold(yellow('\n    Advertencia\n')));
        console.log(yellow('El paquete no está firmado.'));
        console.log(yellow(bold('Podría contener Malware.')));
        console.log(yellow('Úsalo bajo tu propio riesgo.'));

        terminal(bold(yellow("\n- ¿Deseas continuar con la instalación? [y/N] ")));
        
        const response = await terminal.yesOrNo({ yes: ['y', 'Y'], no: ['n', 'N', 'ENTER'] }).promise;

        if (!response) {
            console.log(bold(red("\nInstalación cancelada.")));
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            terminal.processExit(0);
            return;
        }
        console.log(bold(red("\nContinuando instalación sin firma...")));
        terminal.processExit(0);
    }

    console.log(gray('Descomprimiendo paquete...'));
    const zip = new admZip(zipPath);
    const zipEntries = zip.getEntries();

    const rootDir = zipEntries[0].entryName.split('/')[0];

    zipEntries.forEach(entry => {
        if (entry.entryName.startsWith(rootDir + '/')) {
            const targetPath = entry.entryName.substring(rootDir.length + 1);
            
            if (targetPath.length > 0) {
                zip.extractEntryTo(entry.entryName, packageBaseDir, false, true, false, targetPath);
            }
        }
    });

    console.log(gray('Instalando paquetes dependencias...'));
    Commander.run({
        windows: `cd ${packageBaseDir} && pnpm install`,
        linux: 'same',
        macos: 'same'
    });

    console.log(gray(`Limpiando basura...`));
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath);

    console.log(`Paquete ${bold(`${name}@${pkg.version}`)} instalado con éxito.`);
    console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
}