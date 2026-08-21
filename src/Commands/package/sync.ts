import fs from 'fs';
import path from 'path';

import LockFile from '../../Utils/libraries/LockFile';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import ProjectManifest from '../../Utils/ProjectManifest';
import pkgInstall from './install';
import pkgUse from './use';

import { gray, bold } from '../../Utils/drawer';
import { emitJson } from '../../Utils/ndjson';

/** Options accepted by the {@link pkgSync} command. */
interface SyncOptions {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted per package by {@link pkgSync}/{@link syncLockedDependencies} when running in --json mode. */
interface SyncJsonEvent {
    package: string;
    version: string;
    phase: 'already_linked' | 'synced';
}

/**
 * Restores every package declared in a directory's 'dischord.lock.conf' lock file
 * (see {@link LockFile}) into that same directory's './lib' folder.
 *
 * For each locked 'name: version;' entry: installs it globally if it isn't already
 * (via {@link pkgInstall}), then links it into './lib' if it isn't already linked
 * (via {@link pkgUse}), skipping entries that are already fully in place.
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
 * @param {boolean} json - Whether to emit NDJSON progress events instead of human-readable output.
 * @param {Set<string>} [visited] - Internal recursion guard; leave unset when calling from outside.
 * @returns {Promise<void>}
 */
export async function syncLockedDependencies (projectDir: string, json: boolean, visited: Set<string> = new Set()): Promise<void> {
    const entries = LockFile.read(projectDir);
    const names = Object.keys(entries);

    for (const name of names) {
        const version = entries[name];
        const key = `${name}@${version}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const libDir = path.join(projectDir, 'lib');
        const linkPath = path.join(libDir, name);

        if (fs.existsSync(linkPath)) {
            if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'already_linked' });
            else console.log(`${gray('=')} ${bold(name)} ${gray(`(${version}) ya está enlazado`)}`);
        } else {
            if (!LibraryLocalManager.existsRepo(name, version)) {
                await pkgInstall([`${name}@${version}`], { json });
            }

            await pkgUse(name, version, { json }, projectDir);

            if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'synced' });
        }

        const packageDir = path.join(LibraryLocalManager.LibrariesPath, name, version);
        await syncLockedDependencies(packageDir, json, visited);
    }
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
 *
 * @async
 * @param {SyncOptions} [options] - Command options. 'json' switches the output to NDJSON
 * progress events for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<void>}
 */
export default async function pkgSync (options: SyncOptions = {}): Promise<void> {
    const json = !!options.json;
    const cwd = process.cwd();

    ProjectManifest.ensure(cwd);
    ProjectManifest.install(cwd, ['seyfert']);

    if (Object.keys(LockFile.read(cwd)).length === 0) {
        if (!json) console.log(gray('No hay paquetes declarados en dischord.lock.conf.'));
        return;
    }

    await syncLockedDependencies(cwd, json);
}
