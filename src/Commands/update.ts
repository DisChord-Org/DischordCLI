import Commander from "../Utils/commander";
import fs from 'fs'
import { gray, green, red, yellow, cyan } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { printNewVersionAvailableMessage, updateAvailable } from "../Utils/utils";
import homedir from '../Utils/homedir';
import * as cliProgress from 'cli-progress';

/**
 * Internal helper to download and install a specific component.
 * Handles the replacement of active binaries and version metadata updates.
 * @param component The target component ('cli' or 'compiler').
 * @param version The version string to be installed.
 * @param binPath The absolute destination path for the binary.
 * @private
 */
async function updateComponent (component: 'cli' | 'compiler', version: string, binPath: string) {
    const oldPath = `${binPath}.old`;

    /**
     * Windows Binary Replacement Strategy:
     * Since Windows locks files currently in execution, we rename the existing .exe to .old
     * to allow the new binary to be written to the original path.
     * On Unix systems, we simply unlink (delete) the existing file.
     */
    if (Commander.isWindows && fs.existsSync(binPath)) {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(binPath, oldPath);
    } else if (fs.existsSync(binPath)) {
        fs.unlinkSync(binPath);
    }

    const progressBar = new cliProgress.SingleBar({
        format: `${gray('Descargando')} ${cyan(component)} |` + '{bar}' + `| {percentage}% | {value}/{total} MB`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        stopOnComplete: true,
        barsize: Math.floor(process.stdout.columns * 0.4) 
    }, cliProgress.Presets.shades_classic);

    let started = false;

    await Requester.downloadComponent(component, version, binPath, (p) => {
        if (!started) {
            progressBar.start(Math.round(p.total / 1024 / 1024), 0);
            started = true;
        }
        progressBar.update(Math.round(p.transferred / 1024 / 1024));
    });

    progressBar.stop();

    console.log(gray(`Actualizando versión local a v${version}...`));
    if (fs.existsSync(homedir.getVersionPath(component))) fs.unlinkSync(homedir.getVersionPath(component));
    fs.writeFileSync(homedir.getVersionPath(component), version, 'utf-8');

    console.log(green('Actualización completada.'));
}

/**
 * Main update orchestrator for DisChord components.
 * Checks for version availability and triggers the updateComponent logic if needed.
 * @param arg The scope of the update ('cli', 'compiler', or 'all').
 * @param options Configuration options, such as 'force' to override version checks.
 * @returns {Promise<void>}
 */
export default async function update (arg: 'cli' | 'ide' | 'compiler' | 'all', options: { force: boolean }) {
    const versions = await Requester.getVersions();

    switch (arg) {
        case 'cli':
            if (!homedir.existsBinary('chord')) {
                console.log(red('No existe el ejecutable de la CLI en este sistema. Instalando...'));
                await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'));
                return;
            }

            if (!homedir.existsVersion('cli')) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'));
                return;
            }

            const CurrentCLIVersion = fs.readFileSync(homedir.getVersionPath('cli'), 'utf-8');
            if (updateAvailable(CurrentCLIVersion, versions.cli) === 'update-available' || options.force) {
                printNewVersionAvailableMessage(versions.cli);
                await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'));
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'compiler':
            if (!homedir.existsBinary('dischord-compiler')) {
                console.log(red('No existe el compilador en este sistema. Instalando...'));
                await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'));
                return;
            }

            if (!homedir.existsVersion('compiler')) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'));
                return;
            }

            const CurrentCompilerVersion = fs.readFileSync(homedir.getVersionPath('compiler'), 'utf-8');
            if (updateAvailable(CurrentCompilerVersion, versions.compiler) === 'update-available' || options.force) {
                printNewVersionAvailableMessage(versions.compiler);
                await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'));
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'all':
            console.log(yellow('────────') + '    Comprobando CLI     ' + yellow('────────'));
            await update('cli', options);
            console.log(yellow('────────') + ' Comprobando Compilador ' + yellow('────────'));
            await update('compiler', options);
            break;
    }
}