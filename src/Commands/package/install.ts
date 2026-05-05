import semver from 'semver';
import path from 'path';
import fs from 'fs';
import admZip from 'adm-zip';
import { terminal } from 'terminal-kit';
import Bun from 'bun';

import Requester from "../../Utils/requester";
import Commander from '../../Utils/commander';
import LibraryAPIManager from '../../Utils/libraries/LibraryAPIManager';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';

import { red, green, gray, yellow, bold } from "../../Utils/drawer";
import { createBox, createDownloadProgressBar } from "../../Utils/utils";

/** Regular expression to validate the 'vX.X.X' format. */
const vRegex = /^v\d+\.\d+\.\d+$/;

/**
 * Orchestrates the full installation process of a DisChord library.
 * 
 * The process includes:
 * 1. Version format validation.
 * 2. Remote registry lookup.
 * 3. Integrity check via PGP signatures (if audited).
 * 4. User confirmation for unverified packages.
 * 5. Extraction and cleanup of temporary files.
 * 6. Dependency installation using pnpm.
 * 7. Persistence of package metadata in 'data.json'.
 * 
 * @async
 * @param {string} name - The unique name of the package to install.
 * @param {string} [version='latest'] - The target version tag or 'latest'.
 * @returns {Promise<void>}
 */
export default async function pkgInstall(name: string, version: string = 'latest'): Promise<void> {
    if (version !== 'latest' && !vRegex.test(version) && !semver.valid(version)) return console.log(red(`El formato de versión "${version}" es inválido. Usa ${bold('vX.X.X')}`));

    console.log(gray(`Buscando ${bold(`${name}@${version}`)} en el registro...`));
    const pkg = await LibraryAPIManager.getPackage(name, version);
    
    if (!pkg) return console.log(red(`No se encontró el paquete ${bold(name)}.`));
    if(LibraryLocalManager.existsRepo(name, pkg.version)) return console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);;
    
    const packageBaseDir = path.join(LibraryLocalManager.LibrariesPath, name, pkg.version);
    const zipPath = path.join(packageBaseDir, `${name}-${pkg.version}.zip`);
    const sigPath = `${zipPath}.asc`;
    const { bar, handleProgress } = createDownloadProgressBar(`${name}@${pkg.version}`);

    await Requester.downloadFile(
        `${Requester.url}/packages/${name}/${version}/download`,
        zipPath,
        handleProgress
    );
    bar.stop();

    if (pkg.isAudited) {
        console.log(gray('Obteniendo firma...'));
        await Requester.downloadFile(
            `${Requester.url}/packages/${name}/${version}/sign/download`,
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

    const tempDir = path.join(packageBaseDir, '_temp');
    zip.extractAllTo(tempDir, true);

    const entries = fs.readdirSync(tempDir);
    const realRoot = path.join(tempDir, entries[0]);

    const files = fs.readdirSync(realRoot);
    files.forEach(file => {
        const src = path.join(realRoot, file);
        const dest = path.join(packageBaseDir, file);
        fs.renameSync(src, dest);
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(gray('Instalando paquetes dependencias...'));
    Commander.run({
        windows: `cd ${packageBaseDir} && pnpm install`,
        linux: 'same',
        macos: 'same'
    });

    console.log(gray('Preparando módulos para el compilador...'));
    const glob = new Bun.Glob("**/*.ts");

    const tsFiles = Array.from(glob.scanSync({
        cwd: packageBaseDir,
        onlyFiles: true
    }))
        .filter(file => !file.includes('node_modules'))
        .map(file => path.join(packageBaseDir, file));

    if (tsFiles.length > 0) {
        await Bun.build({
            entrypoints: tsFiles,
            outdir: packageBaseDir,
            naming: "[dir]/[name].mjs",
            target: 'node',
            format: 'esm',
            root: packageBaseDir,
            minify: false
        });
        console.log(gray('Transpilación completada con éxito.'));
    }

    console.log(gray('Almacenando información útil...'));
    const packageDataPath = path.join(LibraryLocalManager.LibrariesPath, name, 'data.json');
    if (fs.existsSync(packageDataPath)) fs.unlinkSync(packageDataPath);
    fs.writeFileSync(packageDataPath, JSON.stringify(pkg), 'utf8');

    console.log(gray(`Limpiando basura...`));
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath);

    console.log(`Paquete ${bold(`${name}@${pkg.version}`)} instalado con éxito.`);
    console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
}