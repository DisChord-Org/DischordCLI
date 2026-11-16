import fs from 'fs';
import path from 'path';

import LockFile from '../../Utils/libraries/LockFile';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { entryExists, linkPointsTo } from '../../Utils/libraries/links';
import ProjectManifest from '../../Utils/ProjectManifest';
import pkgInstall, { type InstallContext } from './install';
import pkgUse from './use';

import { gray, bold, red } from '../../Utils/drawer';
import { emitJson } from '../../Utils/ndjson';
import { errorMessage, fail, markFailed } from '../../Utils/output';

/** npm package every DisChord bot project depends on. */
const RUNTIME_DEPENDENCY = 'seyfert';

/** Options accepted by the {@link pkgSync} command. */
interface SyncOptions {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
    /** Whether unsigned packages may be installed without asking for confirmation. */
    allowUnsigned?: boolean;
}

/** Result event emitted per package by {@link pkgSync}/{@link syncLockedDependencies} when running in --json mode. */
interface SyncJsonEvent {
    /** The package the event refers to. */
    package: string;
    /** The locked version of the package. */
    version: string;
    /** The outcome for that package. */
    phase: 'already_linked' | 'synced' | 'error';
    /** Human-readable detail, present on failures. */
    message?: string;
}

/**
 * Event emitted by {@link pkgSync} in --json mode when the project itself cannot be synced
 * (before any package is processed). It keeps the 'package' field every other event carries,
 * holding the project folder's name, so integrations can parse it like the rest.
 */
interface ProjectJsonEvent {
    /** The name of the project folder the command was run in. */
    package: string;
    /** Always 'error'. */
    phase: 'error';
    /** What went wrong. */
    message: string;
}

/**
 * Restores every package declared in a directory's 'dischord.lock.conf' lock file
 * (see {@link LockFile}) into that same directory's './lib' folder.
 *
 * For each locked 'name: version;' entry: installs it globally if it isn't already
 * (via {@link pkgInstall}), then links it into './lib' if it isn't already linked to that
 * exact version (via {@link pkgUse}). A link that is broken or points to another version is
 * replaced. An entry only counts as restored when both steps actually succeeded.
 *
 * This is the core restore logic shared by {@link pkgSync} (the 'chord pkg sync' command,
 * for the user's own project) and 'chord pkg install' (which calls this on a package's own
 * directory right after installing it, to restore that package's own nested dependencies -
 * ej. a library that itself depends on another library via 'chord pkg use' during its own
 * development. Its 'dischord.lock.conf' ships with the package, but its own './lib' symlinks
 * don't, since they aren't portable between machines).
 *
 * Recurses into each restored package's own directory afterwards, regardless of whether it
 * was just freshly installed or already sitting in global storage from before - a package
 * already present doesn't mean its own nested dependencies are satisfied (ej. it may predate
 * this recursive restore, or have had its own './lib' wiped independently). A 'visited' set
 * (keyed by 'name@version') guards this recursion against circular dependencies between
 * packages, which would otherwise loop forever.
 *
 * @async
 * @param {string} projectDir - The directory whose lock file should be restored.
 * @param {InstallContext} context - Output mode and consent settings, forwarded to the installer.
 * @param {Set<string>} [visited] - Internal recursion guard; leave unset when calling from outside.
 * @returns {Promise<boolean>} True if every locked package (and its own dependencies) is in place.
 */
export async function syncLockedDependencies (projectDir: string, context: InstallContext, visited: Set<string> = new Set()): Promise<boolean> {
    const { json } = context;
    const entries = LockFile.read(projectDir);
    let allSynced = true;

    for (const [name, version] of Object.entries(entries)) {
        const key = `${name}@${version}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const linkPath = path.join(projectDir, 'lib', name);
        const packageDir = LibraryLocalManager.getVersionDir(name, version);

        if (entryExists(linkPath) && linkPointsTo(linkPath, packageDir)) {
            if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'already_linked' });
            else console.log(`${gray('=')} ${bold(name)} ${gray(`(${version}) ya está enlazado`)}`);
        } else {
            const available = LibraryLocalManager.existsRepo(name, version)
                || LibraryLocalManager.isInstallActive(name, version)
                || await pkgInstall([key], context);

            if (!available || !(await pkgUse(name, version, { json }, projectDir))) {
                const message = `No se pudo restaurar ${key}.`;

                if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'error', message });
                else fail(red(message));

                allSynced = false;
                continue;
            }

            if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'synced' });
        }

        if (!(await syncLockedDependencies(packageDir, context, visited))) allSynced = false;
    }

    if (!allSynced) markFailed();

    return allSynced;
}

/**
 * Restores every package declared in the current project's 'dischord.lock.conf' lock file,
 * mirroring 'npm install' reading 'package.json' or 'pip install -r requirements.txt', letting
 * a project's dependencies be restored on a fresh checkout without manually repeating
 * 'chord pkg use' for each one.
 *
 * First ensures the project itself is set up (via {@link ProjectManifest}, the same logic
 * 'chord init' uses to create 'package.json' and install 'seyfert') since 'package.json' is
 * gitignored by default and therefore missing on a fresh checkout. This scaffolding step is
 * specific to the user's own bot project - {@link syncLockedDependencies}, which does the
 * actual restoring, is reused as-is for nested library dependencies, which don't need it.
 * It only happens in directories that look like a DisChord project (a lock file or a 'src'
 * folder), and 'seyfert' is only installed when it is actually missing, so running the
 * command twice neither touches the network again nor bumps an already installed version.
 *
 * @async
 * @param {SyncOptions} [options] - Command options. 'json' switches the output to NDJSON
 * progress events for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<boolean>} True if the project and all its locked packages are in place.
 */
export default async function pkgSync (options: SyncOptions = {}): Promise<boolean> {
    const context: InstallContext = { json: !!options.json, allowUnsigned: !!options.allowUnsigned };
    const cwd = process.cwd();

    if (!LockFile.exists(cwd) && !fs.existsSync(path.join(cwd, 'src'))) {
        const message = 'Esta carpeta no parece un proyecto de DisChord (no hay dischord.lock.conf ni carpeta src).';

        if (context.json) emitJson<ProjectJsonEvent>({ package: path.basename(cwd), phase: 'error', message });
        else fail(red(message));

        markFailed();
        return false;
    }

    try {
        ProjectManifest.ensure(cwd);

        if (!ProjectManifest.hasDependency(cwd, RUNTIME_DEPENDENCY)) ProjectManifest.install(cwd, [RUNTIME_DEPENDENCY]);
    } catch (error) {
        const message = `No se pudo preparar el proyecto: ${errorMessage(error)}`;

        if (context.json) emitJson<ProjectJsonEvent>({ package: path.basename(cwd), phase: 'error', message });
        else fail(red(message));

        markFailed();
        return false;
    }

    if (Object.keys(LockFile.read(cwd)).length === 0) {
        if (!context.json) console.log(gray('No hay paquetes declarados en dischord.lock.conf.'));
        return true;
    }

    return await syncLockedDependencies(cwd, context);
}
