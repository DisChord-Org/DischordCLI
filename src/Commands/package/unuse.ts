import path from 'path';
import fs from 'fs';

import { red, gray, bold } from '../../Utils/drawer';
import { emitJson } from '../../Utils/ndjson';
import { errorMessage, fail, markFailed, warn } from '../../Utils/output';
import LockFile from '../../Utils/libraries/LockFile';
import { entryExists, removeEntry } from '../../Utils/libraries/links';
import { isValidPackageName } from '../../Utils/libraries/validation';

/** Files created by the operating system that do not keep './lib' from counting as empty. */
const IGNORED_ENTRIES: readonly string[] = ['.DS_Store'];

/** Options accepted by the {@link pkgUnuse} command. */
interface UnuseOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUnuse} when running in --json mode. */
interface UnuseJsonEvent {
    /** The package the event refers to. */
    package: string;
    /** The outcome of the command. */
    phase: 'unlinked' | 'not_linked' | 'error';
    /** Human-readable detail. */
    message?: string;
}

/**
 * Unlinks a library from the current project by removing its symbolic link.
 *
 * This function reverses `pkgUse` by deleting the link in the local `./lib` folder.
 * If the folder becomes empty, it is also removed to maintain project cleanliness.
 * A link whose target no longer exists (ej. the library was uninstalled globally) is
 * removed like any other.
 *
 * @async
 * @param {string} name - The name of the library to unlink.
 * @param {UnuseOptions} [options] - Command options. 'json' switches the output to a single
 * NDJSON result event for external integrations (ej. DisChord Code Studio).
 * Also removes the entry from the project's 'dischord.lock.conf' lock file (see
 * {@link LockFile}), even if the link itself was already gone. The library's own dependencies
 * are left untouched in the project: they were never copied into the project's 'package.json'
 * in the first place (see {@link pkgUse}), so there's nothing to prune here either.
 * @returns {Promise<boolean>} True if the library ends up unlinked (including when it was not
 * linked to begin with), false if the name is invalid or the link could not be removed.
 */
export default async function pkgUnuse (name: string, options: UnuseOptions = {}): Promise<boolean> {
    const json = !!options.json;

    const reportFailure = (message: string): false => {
        if (json) emitJson<UnuseJsonEvent>({ package: name, phase: 'error', message });
        else fail(red(message));

        markFailed();
        return false;
    };

    if (!isValidPackageName(name)) return reportFailure(`"${name}" no es un nombre de paquete válido.`);

    const projectLibDir = path.join(process.cwd(), 'lib');
    const targetPath = path.join(projectLibDir, name);

    try {
        if (!entryExists(targetPath)) {
            // keep the lock file honest even if the link was removed by hand.
            LockFile.removeEntry(name);

            /**
             * Nothing to undo is not a failure: the project already is in the requested state,
             * so the command still succeeds (integrations treat 'not_linked' as informative).
             */
            const message = `La librería ${name} no está vinculada en este proyecto.`;
            if (json) emitJson<UnuseJsonEvent>({ package: name, phase: 'not_linked', message });
            else warn(red(message));

            return true;
        }

        removeEntry(targetPath);
        LockFile.removeEntry(name);

        /**
         * Ignore '.DS_Store' when deciding whether './lib' is empty - Finder creates it silently
         * in any folder it has browsed, which on macOS was making this check see a 'non-empty'
         * folder forever and leaving an orphaned empty './lib' behind after the last unuse.
         */
        let libDirRemoved = false;
        const remainingEntries = fs.readdirSync(projectLibDir).filter(entry => !IGNORED_ENTRIES.includes(entry));
        if (remainingEntries.length === 0) {
            fs.rmSync(projectLibDir, { recursive: true, force: true });
            libDirRemoved = true;
        }

        if (json) {
            emitJson<UnuseJsonEvent>({ package: name, phase: 'unlinked', message: libDirRemoved ? 'Directorio ./lib eliminado.' : undefined });
        } else {
            console.log(`\n${red('- Unlinked:')} ${bold(name)} de ./lib/${name}`);
            if (libDirRemoved) console.log(gray('Directorio ./lib eliminado.'));
            console.log('');
        }

        return true;
    } catch (error) {
        return reportFailure(`Error al desvincular la librería: ${errorMessage(error)}`);
    }
}
