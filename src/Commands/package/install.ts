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
import { emitJson, createThrottledProgressEmitter } from "../../Utils/ndjson";

/** Regular expression to validate the 'vX.X.X' format. */
const vRegex = /^v\d+\.\d+\.\d+$/;

/** Options accepted by the {@link pkgInstall} command. */
interface InstallOptions {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
}

/** The distinct stages a single package installation can go through when reported over NDJSON. */
type InstallPhase =
    | 'checking'
    | 'not_found'
    | 'already_installed'
    | 'downloading'
    | 'downloading_signature'
    | 'verifying'
    | 'invalid_signature'
    | 'unsigned'
    | 'extracting'
    | 'installing_deps'
    | 'compiling'
    | 'done'
    | 'error';

/** Shape of a single NDJSON progress event emitted by the installer. */
interface JsonEvent {
    package: string;
    version?: string;
    phase: InstallPhase;
    percent?: number;
    current_bytes?: number;
    total_bytes?: number;
    message?: string;
}

/**
 * Orchestrates the full installation process of one or more DisChord libraries.
 *
 * The process includes:
 * 1. Version format validation, and resolution of 'latest' to a concrete version.
 * 2. Remote registry lookup.
 * 3. Integrity check via PGP signatures (if audited).
 * 4. User confirmation for unverified packages (skipped in --json mode, see {@link installSinglePackage}).
 * 5. Extraction and cleanup of temporary files.
 * 6. Dependency installation using pnpm.
 * 7. Persistence of package metadata in 'data.json'.
 *
 * @async
 * @param {string[]} packages - Array of packages in 'name@version' format.
 * @param {InstallOptions} [options] - Installation options. 'json' switches to NDJSON output
 * for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<void>}
 */
export default async function pkgInstall (packages: string[], options: InstallOptions = {}): Promise<void> {
    const json = !!options.json;

    for (const pkgInput of packages) {
        let [name, version] = pkgInput.includes('@')? pkgInput.split('@') : [pkgInput, 'latest'];

        if (version !== 'latest' && !vRegex.test(version) && !semver.valid(version)) {
            const message = `El formato de versión "${version}" para ${bold(name)} es inválido. Use vX.X.X`;
            if (json) emitJson({ package: name, version, phase: 'error', message: `El formato de versión "${version}" es inválido. Use vX.X.X` });
            else console.log(red(message));
            continue;
        }

        if (version === 'latest') {
            const latestVersion = await LibraryAPIManager.getLatestVersion(name);

            if (!latestVersion) {
                if (json) emitJson({ package: name, phase: 'not_found', message: `No se encontró el paquete ${name}.` });
                else console.log(red(`No se encontró el paquete ${bold(name)}.`));
                continue;
            }

            version = latestVersion;
        }

        try {
            await installSinglePackage(name, version, json);
        } catch (error) {
            if (json) emitJson({ package: name, version, phase: 'error', message: String(error) });
            else console.log(red(`Error fatal instalando ${name}:`), error);
        }
    }
}

/**
 * Downloads, verifies and installs a single resolved package version.
 * @param {string} name - The package name.
 * @param {string} version - A concrete, already-resolved version tag (not 'latest').
 * @param {boolean} json - Whether to emit NDJSON progress events instead of human-readable output.
 * In this mode, the interactive unsigned-package confirmation prompt is skipped (there is no
 * TTY to answer it), and the installation proceeds automatically after emitting an 'unsigned' event.
 * @returns {Promise<void>}
 */
async function installSinglePackage (name: string, version: string, json: boolean): Promise<void> {
    if (json) emitJson({ package: name, version, phase: 'checking' });
    else console.log(gray(`Buscando ${bold(`${name}@${version}`)} en el registro...`));

    const pkg = await LibraryAPIManager.getPackage(name, version);

    if (!pkg) {
        if (json) emitJson({ package: name, version, phase: 'not_found', message: `No se encontró el paquete ${name}.` });
        else console.log(red(`No se encontró el paquete ${bold(name)}.`));
        return;
    }

    if (LibraryLocalManager.existsRepo(name, pkg.version)) {
        if (json) emitJson({ package: name, version: pkg.version, phase: 'already_installed' });
        else console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
        return;
    }

    const packageBaseDir = path.join(LibraryLocalManager.LibrariesPath, name, pkg.version);
    const zipPath = path.join(packageBaseDir, `${name}-${pkg.version}.zip`);
    const sigPath = `${zipPath}.asc`;

    if (json) {
        emitJson<JsonEvent>({ package: name, version: pkg.version, phase: 'downloading', percent: 0, current_bytes: 0 });

        await Requester.downloadFile(
            `${Requester.url}/packages/${name}/${version}/download`,
            zipPath,
            createThrottledProgressEmitter<JsonEvent>((percent, progress) => ({
                package: name,
                version: pkg.version,
                phase: 'downloading',
                percent,
                current_bytes: progress.transferred,
                total_bytes: progress.total
            }))
        );
    } else {
        const { bar, handleProgress } = createDownloadProgressBar(`${name}@${pkg.version}`);
        await Requester.downloadFile(
            `${Requester.url}/packages/${name}/${version}/download`,
            zipPath,
            handleProgress
        );
        bar.stop();
    }

    if (pkg.isAudited) {
        if (json) emitJson({ package: name, version: pkg.version, phase: 'downloading_signature' });
        else console.log(gray('Obteniendo firma...'));

        await Requester.downloadFile(
            `${Requester.url}/packages/${name}/${version}/sign/download`,
            `${zipPath}.asc`
        );

        if (json) emitJson({ package: name, version: pkg.version, phase: 'verifying' });
        else console.log(gray('Verificando integridad del paquete...'));

        const signature = fs.readFileSync(sigPath, 'utf8');
        const isValid = await LibraryAPIManager.verifySignature(zipPath, signature);

        if (!isValid) {
            if (json) {
                emitJson({ package: name, version: pkg.version, phase: 'invalid_signature', message: 'La firma no es válida. El archivo podría haber sido manipulado (posible MitM). Instalación abortada.' });
            } else {
                console.log(createBox(red('Firma no válida')));
                console.log(red('El archivo podría haber sido manipulado.'));
                console.log(bold(red('Posible Man In The Middle (MitM).')));
                console.log(red('Abortando instalación.'));
            }

            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath);
            return;
        }

        if (!json) console.log(gray('Firma verificada correctamente.'));
    } else {
        if (json) {
            emitJson({ package: name, version: pkg.version, phase: 'unsigned', message: 'El paquete no está firmado. Podría contener malware. Continuando bajo tu propio riesgo.' });
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
    }

    if (json) emitJson({ package: name, version: pkg.version, phase: 'extracting' });
    else console.log(gray('Descomprimiendo paquete...'));

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

    if (json) emitJson({ package: name, version: pkg.version, phase: 'installing_deps' });
    else console.log(gray('Instalando paquetes dependencias...'));

    Commander.run({
        windows: `cd ${packageBaseDir} && pnpm install`,
        linux: 'same',
        macos: 'same'
    });

    const glob = new Bun.Glob("**/*.ts");

    const tsFiles = Array.from(glob.scanSync({
        cwd: packageBaseDir,
        onlyFiles: true
    }))
        .filter(file => !file.includes('node_modules'))
        .map(file => path.join(packageBaseDir, file));

    if (tsFiles.length > 0) {
        if (json) emitJson({ package: name, version: pkg.version, phase: 'compiling' });
        else console.log(gray('Preparando módulos para el compilador...'));

        await Bun.build({
            entrypoints: tsFiles,
            outdir: packageBaseDir,
            naming: "[dir]/[name].mjs",
            target: 'node',
            format: 'esm',
            root: packageBaseDir,
            minify: false
        });

        if (!json) console.log(gray('Transpilación completada con éxito.'));
    }

    const packageDataPath = path.join(LibraryLocalManager.LibrariesPath, name, 'data.json');
    if (fs.existsSync(packageDataPath)) fs.unlinkSync(packageDataPath);
    fs.writeFileSync(packageDataPath, JSON.stringify(pkg), 'utf8');

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath);

    if (json) {
        emitJson({ package: name, version: pkg.version, phase: 'done' });
    } else {
        console.log(`Paquete ${bold(`${name}@${pkg.version}`)} instalado con éxito.`);
        console.log(`\n${bold(green('+ ') + name)} ${gray(pkg.version)}\n`);
    }
}
