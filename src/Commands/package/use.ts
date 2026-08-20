import path from 'path';
import fs from 'fs';

import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import LockFile from '../../Utils/libraries/LockFile';

import { red, green, gray, bold } from "../../Utils/drawer";
import Commander from '../../Utils/commander';
import { emitJson } from '../../Utils/ndjson';

/** Options accepted by the {@link pkgUse} command. */
interface UseOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUse} when running in --json mode. */
interface UseJsonEvent {
    package: string;
    version: string;
    phase: 'linked' | 'not_installed' | 'error';
    path?: string;
    message?: string;
}

/**
 * Links a specific version of a globally installed library to the current project's local directory.
 *
 * This function creates a symbolic link (or a junction on Windows) inside the `./lib` folder
 * of the project, pointing to the source files in the DisChord global storage. This allows
 * the transpiler to access library components without duplicating files across projects.
 *
 * @async
 * @param {string} name - The unique name of the library to use.
 * @param {string} version - The specific version tag to link.
 * @param {UseOptions} [options] - Command options. 'json' switches the output to a single
 * NDJSON result event for external integrations (ej. DisChord Code Studio).
 * On success, also records the link in the project's 'dischord.lock.conf' lock file
 * (see {@link LockFile}), so 'chord pkg sync' can restore it later.
 *
 * The library's own dependencies are NOT copied into the project's 'package.json': each
 * library already got its own isolated 'node_modules' when it was installed (see
 * {@link pkgInstall}), and Node resolves a symlinked module's imports against its real
 * path, so it naturally picks those up. This mirrors pnpm's own strict/symlinked
 * 'node_modules' layout, where a package's dependencies are resolved from its own
 * manifest rather than hoisted into a shared, potentially conflicting list.
 * @returns {Promise<void>}
 */
export default async function pkgUse(name: string, version: string, options: UseOptions = {}): Promise<void> {
    const json = !!options.json;
    const sourcePath = path.join(LibraryLocalManager.LibrariesPath, name, version);
    const projectLibDir = path.join(process.cwd(), 'lib');
    const targetPath = path.join(projectLibDir, name);

    if (!fs.existsSync(sourcePath)) {
        const message = `${name}@${version} no está instalada.`;
        if (json) emitJson<UseJsonEvent>({ package: name, version, phase: 'not_installed', message });
        else console.log(red(`${bold(`${name}@${version}`)} no está instalada.`));
        return;
    }

    if (!fs.existsSync(projectLibDir)) fs.mkdirSync(projectLibDir, { recursive: true });

    if (fs.existsSync(targetPath)) {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink() || stats.isFile()) fs.unlinkSync(targetPath);
        else fs.rmSync(targetPath, { recursive: true, force: true });
    }

    try {
        fs.symlinkSync(sourcePath, targetPath, Commander.isWindows ? 'junction' : 'dir');
        LockFile.setEntry(name, version);

        if (json) emitJson<UseJsonEvent>({ package: name, version, phase: 'linked', path: targetPath });
        else console.log(`\n${green('Linked:')} ${bold(name)} (${version}) -> ./lib/${name}`);
    } catch (error: any) {
        if (json) {
            const tip = Commander.isWindows ? " En Windows, activa el 'Modo Desarrollador' o ejecuta como Admin." : undefined;
            emitJson<UseJsonEvent>({ package: name, version, phase: 'error', message: `Error al crear el enlace simbólico: ${error.message}.${tip ?? ''}` });
        } else {
            console.log(red(`\nError al crear el enlace simbólico: ${error.message}`));
            if (Commander.isWindows) console.log(gray("Tip: En Windows, activa el 'Modo Desarrollador' o ejecuta como Admin."));
        }
    }
}