import { red, bold, gray } from '../../Utils/drawer';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { isValidPackageName, isValidVersionTag } from '../../Utils/libraries/validation';
import { emitJson } from '../../Utils/ndjson';
import { errorMessage, fail, markFailed, warn } from '../../Utils/output';

/** Options accepted by the {@link pkgUninstall} command. */
interface UninstallOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUninstall} when running in --json mode. */
interface UninstallJsonEvent {
    /** The package the event refers to. */
    package: string;
    /** The version that was requested. */
    version: string;
    /** The outcome of the command. */
    phase: 'not_installed' | 'version_not_installed' | 'uninstalled' | 'error';
    /** Human-readable detail, present on failures. */
    message?: string;
}

/**
 * Permanently removes a specific version of a library from the global storage.
 *
 * This function deletes the version directory within the DisChord global path.
 * If the library's root folder becomes empty after deletion, it is also removed.
 *
 * @async
 * @param {string} name - The name of the package to uninstall.
 * @param {string} version - The specific version tag to remove.
 * @param {UninstallOptions} [options] - Command options. 'json' switches the output to a single
 * NDJSON result event for external integrations (ej. DisChord Code Studio).
 * @returns {Promise<boolean>} True if the version ends up removed (including when it was not
 * installed to begin with), false if the reference is invalid or the removal failed.
 */
export default async function pkgUninstall (name: string, version: string, options: UninstallOptions = {}): Promise<boolean> {
    const json = !!options.json;

    const reportFailure = (message: string): false => {
        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'error', message });
        else fail(red(message));

        markFailed();
        return false;
    };

    if (!isValidPackageName(name) || !isValidVersionTag(version)) {
        return reportFailure(`"${name}@${version}" no es una referencia de paquete válida.`);
    }

    /**
     * Nothing to remove is not a failure: the storage already is in the requested state, so the
     * command still succeeds (integrations treat both phases as informative).
     */
    const reportNothingToRemove = (phase: 'not_installed' | 'version_not_installed', message: string): true => {
        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase, message });
        else warn(red(message));

        return true;
    };

    if (!LibraryLocalManager.existsRepo(name)) return reportNothingToRemove('not_installed', `El paquete ${name} no está instalado.`);

    if (!LibraryLocalManager.existsRepo(name, version)) {
        return reportNothingToRemove('version_not_installed', `La versión ${version} de ${name} no está instalada.`);
    }

    try {
        LibraryLocalManager.removePackage(name, version);
    } catch (error) {
        return reportFailure(`Error al desinstalar el paquete: ${errorMessage(error)}`);
    }

    if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'uninstalled' });
    else console.log(`\n${bold(red('- ') + name)} ${gray(version)}\n`);

    return true;
}
