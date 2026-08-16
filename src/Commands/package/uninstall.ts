import path from 'path';
import fs from 'fs';
import { red, bold, gray } from "../../Utils/drawer";
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { emitJson } from '../../Utils/ndjson';

/** Options accepted by the {@link pkgUninstall} command. */
interface UninstallOptions {
    /** Whether to emit a single NDJSON result event instead of human-readable output. */
    json?: boolean;
}

/** Result event emitted by {@link pkgUninstall} when running in --json mode. */
interface UninstallJsonEvent {
    package: string;
    version: string;
    phase: 'not_installed' | 'version_not_installed' | 'uninstalled' | 'error';
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
 * @returns {Promise<void>}
 */
export default async function pkgUninstall(name: string, version: string, options: UninstallOptions = {}): Promise<void> {
    const json = !!options.json;
    const packagePath = path.join(LibraryLocalManager.LibrariesPath, name);

    if (!fs.existsSync(packagePath)) {
        const message = `El paquete ${name} no está instalado.`;
        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'not_installed', message });
        else console.log(red(`El paquete ${bold(name)} no está instalado.`));
        return;
    }

    const versionPath = path.join(packagePath, version);

    if (!fs.existsSync(versionPath)) {
        const message = `La versión ${version} de ${name} no está instalada.`;
        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'version_not_installed', message });
        else console.log(red(`La versión ${bold(version)} de ${bold(name)} no está instalada.`));
        return;
    }

    try {
        LibraryLocalManager.removePackage(name, version);

        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'uninstalled' });
        else console.log(`\n${bold(red('- ') + name)} ${gray(version)}\n`);
    } catch (error: any) {
        const message = `Error al desinstalar el paquete: ${error.message}`;
        if (json) emitJson<UninstallJsonEvent>({ package: name, version, phase: 'error', message });
        else console.log(red(`\n${message}`));
    }
}