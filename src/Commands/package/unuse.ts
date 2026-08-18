import path from 'path';
import fs from 'fs';

import { red, gray, bold } from "../../Utils/drawer";
import { emitJson } from '../../Utils/ndjson';
import LockFile from '../../Utils/libraries/LockFile';

/** Options accepted by the {@link pkgUnuse} command. */
interface UnuseOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUnuse} when running in --json mode. */
interface UnuseJsonEvent {
    package: string;
    phase: 'unlinked' | 'not_linked' | 'error';
    message?: string;
}

/**
 * Unlinks a library from the current project by removing its symbolic link.
 *
 * This function reverses `pkgUse` by deleting the link in the local `./lib` folder.
 * If the folder becomes empty, it is also removed to maintain project cleanliness.
 *
 * @async
 * @param {string} name - The name of the library to unlink.
 * @param {UnuseOptions} [options] - Command options. 'json' switches the output to a single
 * NDJSON result event for external integrations (ej. DisChord Code Studio).
 * On success, also removes the entry from the project's 'dischord.lock.conf' lock file
 * (see {@link LockFile}).
 * @returns {Promise<void>}
 */
export default async function pkgUnuse(name: string, options: UnuseOptions = {}): Promise<void> {
    const json = !!options.json;
    const projectLibDir = path.join(process.cwd(), 'lib');
    const targetPath = path.join(projectLibDir, name);

    if (!fs.existsSync(targetPath)) {
        const message = `La librería ${name} no está vinculada en este proyecto.`;
        if (json) emitJson<UnuseJsonEvent>({ package: name, phase: 'not_linked', message });
        else console.log(red(`La librería ${bold(name)} no está vinculada en este proyecto.`));
        return;
    }

    try {
        const stats = fs.lstatSync(targetPath);

        if (stats.isSymbolicLink() || stats.isFile()) fs.unlinkSync(targetPath);
        else fs.rmSync(targetPath, { recursive: true, force: true });

        LockFile.removeEntry(name);

        let libDirRemoved = false;
        if (fs.readdirSync(projectLibDir).length === 0) {
            fs.rmSync(projectLibDir, { recursive: true, force: true });
            libDirRemoved = true;
        }

        if (json) {
            emitJson<UnuseJsonEvent>({ package: name, phase: 'unlinked', message: libDirRemoved ? 'Directorio ./lib eliminado.' : undefined });
        } else {
            console.log(`\n${red('- Unlinked:')} ${bold(name)} de ./lib/${name}`);
            if (libDirRemoved) console.log(gray(`Directorio ./lib eliminado.`));
            console.log("");
        }
    } catch (error: any) {
        const message = `Error al desvincular la librería: ${error.message}`;
        if (json) emitJson<UnuseJsonEvent>({ package: name, phase: 'error', message });
        else console.log(red(`\n${message}`));
    }
}