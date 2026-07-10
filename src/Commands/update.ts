import Commander from "../Utils/commander";
import fs from 'fs'
import { gray, green, red, yellow, cyan } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { createDownloadProgressBar, printNewVersionAvailableMessage, updateAvailable } from "../Utils/utils";
import homedir from '../Utils/homedir';

type UpdateTool = 'cli' | 'compiler' | 'all';
type UpdatePhase = 'checking' | 'up_to_date' | 'downloading' | 'installing' | 'done' | 'error' | 'finished';

interface Versions {
    cli: string;
    compiler: string;
    ide: string;
}

interface UpdateOptions {
    force: boolean;
    json?: boolean;
}

interface JsonEvent {
    tool: UpdateTool;
    phase: UpdatePhase;
    percent?: number;
    current_bytes?: number;
    total_bytes?: number;
    version?: string;
    message?: string;
}

function emitJson(event: JsonEvent) {
    process.stdout.write(JSON.stringify(event) + '\n');
}

/**
 * Internal helper to download and install a specific component.
 * Handles the replacement of active binaries and version metadata updates.
 * @param component The target component ('cli' or 'compiler').
 * @param version The version string to be installed.
 * @param binPath The absolute destination path for the binary.
 * @param json Whether to emit NDJSON progress events instead of human-readable output.
 * @private
 */
async function updateComponent(component: 'cli' | 'compiler', version: string, binPath: string, json: boolean) {
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

    if (json) {
        let lastEmittedPercent = -1;
        emitJson({ tool: component, phase: 'downloading', percent: 0, current_bytes: 0, version });

        await Requester.downloadComponent(component, version, binPath, (progress) => {
            const percent = progress.total > 0 ? (progress.transferred / progress.total) * 100 : 0;
            const roundedPercent = Math.floor(percent);

            if (roundedPercent !== lastEmittedPercent) {
                lastEmittedPercent = roundedPercent;
                emitJson({
                    tool: component,
                    phase: 'downloading',
                    percent,
                    current_bytes: progress.transferred,
                    total_bytes: progress.total,
                    version,
                });
            }
        });

        emitJson({ tool: component, phase: 'installing', version });
    } else {
        const { bar, handleProgress } = createDownloadProgressBar(component);

        try {
            await Requester.downloadComponent(component, version, binPath, handleProgress);
            bar.stop();
        } catch (error) {
            bar.stop();
            throw error;
        }

        console.log(gray(`Actualizando versión local a v${version}...`));
    }

    if (fs.existsSync(homedir.getVersionPath(component))) fs.unlinkSync(homedir.getVersionPath(component));
    fs.writeFileSync(homedir.getVersionPath(component), version, 'utf-8');

    if (json) {
        emitJson({ tool: component, phase: 'done', version });
    } else {
        console.log(green('Actualización completada.'));
    }
}

/**
 * Checks and, if needed, installs the CLI. Errors are caught and reported
 * as a JSON "error" event in json mode (so `chord update all --json` keeps
 * going and can still try the compiler), or rethrown in human mode to
 * preserve the previous behaviour.
 */
async function updateCli(versions: Versions, options: UpdateOptions, json: boolean) {
    if (json) emitJson({ tool: 'cli', phase: 'checking' });

    try {
        if (!homedir.existsBinary('chord')) {
            if (!json) console.log(red('No existe el ejecutable de la CLI en este sistema. Instalando...'));
            await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'), json);
            return;
        }

        if (!homedir.existsVersion('cli')) {
            if (!json) console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
            await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'), json);
            return;
        }

        const currentCLIVersion = fs.readFileSync(homedir.getVersionPath('cli'), 'utf-8');
        if (updateAvailable(currentCLIVersion, versions.cli) === 'update-available' || options.force) {
            if (!json) printNewVersionAvailableMessage(versions.cli);
            await updateComponent('cli', versions.cli, homedir.getBinaryPath('chord'), json);
        } else {
            if (json) emitJson({ tool: 'cli', phase: 'up_to_date' });
            else console.log(green('Todo a la orden del día.'));
        }
    } catch (error) {
        if (json) emitJson({ tool: 'cli', phase: 'error', message: String(error) });
        else throw error;
    }
}

/**
 * Checks and, if needed, installs the compiler. Same error-handling
 * philosophy as {@link updateCli}.
 */
async function updateCompiler(versions: Versions, options: UpdateOptions, json: boolean) {
    if (json) emitJson({ tool: 'compiler', phase: 'checking' });

    try {
        if (!homedir.existsBinary('dischord-compiler')) {
            if (!json) console.log(red('No existe el compilador en este sistema. Instalando...'));
            await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'), json);
            return;
        }

        if (!homedir.existsVersion('compiler')) {
            if (!json) console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
            await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'), json);
            return;
        }

        const currentCompilerVersion = fs.readFileSync(homedir.getVersionPath('compiler'), 'utf-8');
        if (updateAvailable(currentCompilerVersion, versions.compiler) === 'update-available' || options.force) {
            if (!json) printNewVersionAvailableMessage(versions.compiler);
            await updateComponent('compiler', versions.compiler, homedir.getBinaryPath('dischord-compiler'), json);
        } else {
            if (json) emitJson({ tool: 'compiler', phase: 'up_to_date' });
            else console.log(green('Todo a la orden del día.'));
        }
    } catch (error) {
        if (json) emitJson({ tool: 'compiler', phase: 'error', message: String(error) });
        else throw error;
    }
}

/**
 * Main update orchestrator for DisChord components.
 * Checks for version availability and triggers the updateComponent logic if needed.
 * @param arg The scope of the update ('cli', 'compiler', or 'all').
 * @param options Configuration options: 'force' overrides version checks, 'json'
 * switches to NDJSON output for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<void>}
 */
export default async function update(arg: 'cli' | 'ide' | 'compiler' | 'all', options: UpdateOptions) {
    const json = !!options.json;

    let versions: Versions;
    try {
        versions = await Requester.getVersions();
    } catch (error) {
        const message = `No se pudo contactar con el servidor de DisChord: ${error}`;

        if (json) {
            const targets: Array<'cli' | 'compiler'> =
                arg === 'all' ? ['cli', 'compiler'] : (arg === 'cli' || arg === 'compiler') ? [arg] : [];
            for (const target of targets) emitJson({ tool: target, phase: 'error', message });
        } else {
            console.log(red(message));
        }
        return;
    }

    switch (arg) {
        case 'cli':
            await updateCli(versions, options, json);
            break;
        case 'compiler':
            await updateCompiler(versions, options, json);
            break;
        case 'all':
            if (!json) console.log(yellow('────────') + '    Comprobando CLI     ' + yellow('────────'));
            await updateCli(versions, options, json);

            if (!json) console.log(yellow('────────') + ' Comprobando Compilador ' + yellow('────────'));
            await updateCompiler(versions, options, json);

            if (json) emitJson({ tool: 'all', phase: 'finished' });
            break;
    }
}