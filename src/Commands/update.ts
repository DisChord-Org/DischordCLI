import fs from 'fs';
import semver from 'semver';

import Commander from '../Utils/commander';
import { gray, green, red, yellow } from '../Utils/drawer';
import Requester, { type Versions } from '../Utils/requester';
import { createDownloadProgressBar, printNewVersionAvailableMessage, updateAvailable } from '../Utils/utils';
import homedir, { type ManagedBinary } from '../Utils/homedir';
import { emitJson, createThrottledProgressEmitter } from '../Utils/ndjson';
import { errorMessage, fail, markFailed, warn } from '../Utils/output';

/** A component that can be updated on its own. */
type UpdatableTool = 'cli' | 'compiler';

/** The scope accepted by the 'chord update' command. */
type UpdateTarget = UpdatableTool | 'all';

/** The distinct stages an update can go through when reported over NDJSON. */
type UpdatePhase = 'checking' | 'up_to_date' | 'downloading' | 'installing' | 'done' | 'error' | 'finished';

/** Options accepted by the {@link update} command. */
interface UpdateOptions {
    /** Whether to reinstall even if the installed version is already the latest one. */
    force: boolean;
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
}

/** Shape of a single NDJSON progress event emitted by the updater. */
interface JsonEvent {
    /** The component the event refers to, or 'all' for the closing event of a full update. */
    tool: UpdateTarget;
    /** The stage the update is in. */
    phase: UpdatePhase;
    /** Download progress, from 0 to 100. Only present while downloading. */
    percent?: number;
    /** Bytes downloaded so far. Only present while downloading. */
    current_bytes?: number;
    /** Total bytes to download, when announced by the server. */
    total_bytes?: number;
    /** The version being installed. */
    version?: string;
    /** Human-readable detail, present on errors. */
    message?: string;
}

/** Static description of an updatable component. */
interface ToolDescriptor {
    /** The executable installed for this component. */
    binary: ManagedBinary;
    /** Message shown when the executable is not installed at all. */
    missingMessage: string;
}

/** The components 'chord update' knows how to install. */
const TOOLS: Record<UpdatableTool, ToolDescriptor> = {
    cli: { binary: 'chord', missingMessage: 'No existe el ejecutable de la CLI en este sistema. Instalando...' },
    compiler: { binary: 'dischord-compiler', missingMessage: 'No existe el compilador en este sistema. Instalando...' }
};

/**
 * Puts a freshly downloaded binary in place of the installed one.
 *
 * On Unix the new file is renamed over the old one, which is atomic and works even while the
 * old binary is running. Windows locks executables that are in use, so the current one is
 * first renamed to '.old' (allowed even while running) and restored if the swap fails.
 * @param {string} downloadedPath - Path of the complete, already downloaded binary.
 * @param {string} binPath - Path the binary must end up at.
 * @throws {Error} If the binary cannot be moved into place; the previous one is kept.
 * @returns {void}
 */
function replaceBinary (downloadedPath: string, binPath: string): void {
    if (!Commander.isWindows || !fs.existsSync(binPath)) {
        fs.renameSync(downloadedPath, binPath);
        return;
    }

    const oldPath = `${binPath}.old`;

    fs.rmSync(oldPath, { force: true });
    fs.renameSync(binPath, oldPath);

    try {
        fs.renameSync(downloadedPath, binPath);
    } catch (error) {
        fs.renameSync(oldPath, binPath);
        throw error;
    }
}

/**
 * Downloads and installs a specific version of a component.
 *
 * The binary is downloaded to a temporary path next to its destination and only swapped in
 * once the download is complete, so a network failure never leaves the user without a
 * working executable.
 * @async
 * @param {UpdatableTool} tool - The component to install.
 * @param {string} version - The version to install, without the 'v' prefix.
 * @param {boolean} json - Whether to emit NDJSON progress events instead of human-readable output.
 * @throws {Error} If the download or the replacement of the binary fails.
 * @returns {Promise<void>}
 */
async function installTool (tool: UpdatableTool, version: string, json: boolean): Promise<void> {
    const binPath = homedir.getBinaryPath(TOOLS[tool].binary);
    const downloadedPath = `${binPath}.new`;
    let checksumVerified = false;

    try {
        if (json) {
            emitJson<JsonEvent>({ tool, phase: 'downloading', percent: 0, current_bytes: 0, version });

            checksumVerified = await Requester.downloadComponent(tool, version, downloadedPath, createThrottledProgressEmitter<JsonEvent>((percent, progress) => ({
                tool,
                phase: 'downloading',
                percent,
                current_bytes: progress.transferred,
                total_bytes: progress.total,
                version
            })));

            emitJson<JsonEvent>({ tool, phase: 'installing', version });
        } else {
            const { bar, handleProgress } = createDownloadProgressBar(tool);

            try {
                checksumVerified = await Requester.downloadComponent(tool, version, downloadedPath, handleProgress);
            } finally {
                bar.stop();
            }

            console.log(gray(`Actualizando versión local a v${version}...`));
        }

        if (!checksumVerified) {
            warn(yellow('ADVERTENCIA: ') + `No hay checksum publicado para ${tool} v${version}; se instala sin esa comprobación de integridad.`);
        }

        replaceBinary(downloadedPath, binPath);
    } finally {
        fs.rmSync(downloadedPath, { force: true });
    }

    fs.writeFileSync(homedir.getVersionPath(tool), version, 'utf-8');

    if (json) emitJson<JsonEvent>({ tool, phase: 'done', version });
    else console.log(green('Actualización completada.'));
}

/**
 * Reads the installed version of a component from its version file.
 * @param {UpdatableTool} tool - The component to look up.
 * @returns {string | undefined} The installed version, or undefined if the file is missing or
 * does not hold a valid version (in which case the component should be reinstalled).
 */
function readInstalledVersion (tool: UpdatableTool): string | undefined {
    if (!homedir.existsVersion(tool)) return undefined;

    return semver.valid(fs.readFileSync(homedir.getVersionPath(tool), 'utf-8').trim()) ?? undefined;
}

/**
 * Checks a component and installs it if it is missing, outdated or forced.
 * Errors never propagate: they are reported (as an 'error' event in --json mode) and reflected
 * in the returned value, so 'chord update all' can still try the remaining components.
 * @async
 * @param {UpdatableTool} tool - The component to update.
 * @param {Versions} versions - The latest versions published by the API.
 * @param {UpdateOptions} options - The command options.
 * @returns {Promise<boolean>} True if the component is up to date after the call.
 */
async function updateTool (tool: UpdatableTool, versions: Versions, options: UpdateOptions): Promise<boolean> {
    const json = !!options.json;
    const latest = versions[tool];

    if (json) emitJson<JsonEvent>({ tool, phase: 'checking' });

    try {
        if (!semver.valid(latest)) throw new Error(`El servidor devolvió una versión no válida para ${tool}: "${latest}".`);

        if (!homedir.existsBinary(TOOLS[tool].binary)) {
            if (!json) console.log(red(TOOLS[tool].missingMessage));
            await installTool(tool, latest, json);
            return true;
        }

        const current = readInstalledVersion(tool);

        if (!current) {
            if (!json) console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
            await installTool(tool, latest, json);
            return true;
        }

        if (options.force || updateAvailable(current, latest) === 'update-available') {
            if (!json) printNewVersionAvailableMessage(latest);
            await installTool(tool, latest, json);
            return true;
        }

        if (json) emitJson<JsonEvent>({ tool, phase: 'up_to_date' });
        else console.log(green('Todo a la orden del día.'));

        return true;
    } catch (error) {
        if (json) {
            emitJson<JsonEvent>({ tool, phase: 'error', message: errorMessage(error) });
            markFailed();
        } else {
            fail(red('ERROR: ') + errorMessage(error));
        }

        return false;
    }
}

/**
 * Main update orchestrator for DisChord components.
 * Checks for version availability and installs whatever is missing or outdated.
 * @async
 * @param {UpdateTarget} target - The scope of the update ('cli', 'compiler', or 'all').
 * @param {UpdateOptions} options - Configuration options: 'force' overrides version checks, 'json'
 * switches to NDJSON output for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<boolean>} True if every requested component is up to date after the call.
 */
export default async function update (target: UpdateTarget, options: UpdateOptions): Promise<boolean> {
    const json = !!options.json;
    const tools: UpdatableTool[] = target === 'all' ? ['cli', 'compiler'] : [target];

    let versions: Versions;

    try {
        versions = await Requester.getVersions();
    } catch (error) {
        const message = `No se pudo contactar con el servidor de DisChord: ${errorMessage(error)}`;

        if (json) {
            for (const tool of tools) emitJson<JsonEvent>({ tool, phase: 'error', message });
            markFailed();
        } else {
            fail(red(message));
        }

        return false;
    }

    const headers: Record<UpdatableTool, string> = {
        cli: yellow('────────') + '    Comprobando CLI     ' + yellow('────────'),
        compiler: yellow('────────') + ' Comprobando Compilador ' + yellow('────────')
    };

    let allUpdated = true;

    for (const tool of tools) {
        if (!json && target === 'all') console.log(headers[tool]);
        if (!(await updateTool(tool, versions, options))) allUpdated = false;
    }

    if (json && target === 'all') emitJson<JsonEvent>({ tool: 'all', phase: 'finished' });

    return allUpdated;
}
