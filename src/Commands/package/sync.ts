import fs from 'fs';
import path from 'path';

import LockFile from '../../Utils/libraries/LockFile';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import pkgInstall from './install';
import pkgUse from './use';
import { ensureProjectManifest } from '../init';

import { gray, bold } from '../../Utils/drawer';
import { emitJson } from '../../Utils/ndjson';

/** Options accepted by the {@link pkgSync} command. */
interface SyncOptions {
    /** Whether to emit NDJSON progress events instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted per package by {@link pkgSync} when running in --json mode. */
interface SyncJsonEvent {
    package: string;
    version: string;
    phase: 'already_linked' | 'synced';
}

/**
 * Restores every package declared in the project's 'dischord.lock.conf' lock file
 * (see {@link LockFile}).
 *
 * First ensures the project itself is set up (via {@link ensureProjectManifest}, the same
 * logic 'chord init' uses to create 'package.json' and install 'seyfert') since 'package.json'
 * is gitignored by default and therefore missing on a fresh checkout.
 *
 * For each locked 'name: version;' entry: installs it globally if it isn't already
 * (via {@link pkgInstall}), then links it into './lib' if it isn't already linked
 * (via {@link pkgUse}), skipping entries that are already fully in place. This mirrors
 * 'npm install' reading 'package.json' or 'pip install -r requirements.txt', letting a
 * project's dependencies be restored on a fresh checkout without manually repeating
 * 'chord pkg use' for each one.
 *
 * @async
 * @param {SyncOptions} [options] - Command options. 'json' switches the output to NDJSON
 * progress events for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<void>}
 */
export default async function pkgSync (options: SyncOptions = {}): Promise<void> {
    const json = !!options.json;

    ensureProjectManifest(process.cwd());

    const entries = LockFile.read();
    const names = Object.keys(entries);

    if (names.length === 0) {
        if (!json) console.log(gray('No hay paquetes declarados en dischord.lock.conf.'));
        return;
    }

    const projectLibDir = path.join(process.cwd(), 'lib');

    for (const name of names) {
        const version = entries[name];
        const linkPath = path.join(projectLibDir, name);

        if (fs.existsSync(linkPath)) {
            if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'already_linked' });
            else console.log(`${gray('=')} ${bold(name)} ${gray(`(${version}) ya está enlazado`)}`);
            continue;
        }

        if (!LibraryLocalManager.existsRepo(name, version)) {
            await pkgInstall([`${name}@${version}`], { json });
        }

        await pkgUse(name, version, { json });

        if (json) emitJson<SyncJsonEvent>({ package: name, version, phase: 'synced' });
    }
}
