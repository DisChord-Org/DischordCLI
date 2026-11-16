import path from 'path';
import fs from 'fs';

import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import LockFile from '../../Utils/libraries/LockFile';
import { createDirectoryLink, removeEntry } from '../../Utils/libraries/links';
import { isValidPackageName, isValidVersionTag } from '../../Utils/libraries/validation';

import { red, green, gray, bold } from '../../Utils/drawer';
import Commander from '../../Utils/commander';
import { emitJson } from '../../Utils/ndjson';
import { fail, markFailed } from '../../Utils/output';

/** Options accepted by the {@link pkgUse} command. */
interface UseOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUse} when running in --json mode. */
interface UseJsonEvent {
    /** The package the event refers to. */
    package: string;
    /** The version that was requested. */
    version: string;
    /** The outcome of the command. */
    phase: 'linked' | 'not_installed' | 'error';
    /** Absolute path of the created link. Only present on success. */
    path?: string;
    /** Human-readable detail, present on failures. */
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
 * @param {string} [projectDir] - The project directory to link into. Defaults to the current
 * working directory (the CLI command's own project); an explicit directory is used when linking
 * a nested package's own dependencies into its own 'lib' folder, ej. during 'chord pkg install'
 * (see {@link LockFile.getPath}).
 * @returns {Promise<boolean>} True if the library was linked, false otherwise.
 */
export default async function pkgUse (name: string, version: string, options: UseOptions = {}, projectDir: string = process.cwd()): Promise<boolean> {
    const json = !!options.json;

    const reportFailure = (phase: 'not_installed' | 'error', message: string): false => {
        if (json) emitJson<UseJsonEvent>({ package: name, version, phase, message });
        else fail(red(message));

        markFailed();
        return false;
    };

    if (!isValidPackageName(name) || !isValidVersionTag(version)) {
        return reportFailure('error', `"${name}@${version}" no es una referencia de paquete válida.`);
    }

    const sourcePath = LibraryLocalManager.getVersionDir(name, version);
    const projectLibDir = path.join(projectDir, 'lib');
    const targetPath = path.join(projectLibDir, name);

    /**
     * A version still being installed by this very process is accepted too: it happens when
     * two packages depend on each other, and each has to be linked into the other while both
     * installations are still in progress.
     */
    if (!LibraryLocalManager.existsRepo(name, version) && !LibraryLocalManager.isInstallActive(name, version)) {
        return reportFailure('not_installed', `${name}@${version} no está instalada.`);
    }

    try {
        fs.mkdirSync(projectLibDir, { recursive: true });

        removeEntry(targetPath);
        createDirectoryLink(sourcePath, targetPath);
        LockFile.setEntry(name, version, projectDir);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const tip = Commander.isWindows ? " En Windows, activa el 'Modo Desarrollador' o ejecuta como Admin." : '';

        if (json) {
            emitJson<UseJsonEvent>({ package: name, version, phase: 'error', message: `Error al crear el enlace simbólico: ${reason}.${tip}` });
            markFailed();
        } else {
            fail(red(`\nError al crear el enlace simbólico: ${reason}`));
            if (tip) console.error(gray(`Tip:${tip}`));
        }

        return false;
    }

    if (json) emitJson<UseJsonEvent>({ package: name, version, phase: 'linked', path: targetPath });
    else console.log(`\n${green('Linked:')} ${bold(name)} (${version}) -> ./lib/${name}`);

    return true;
}
