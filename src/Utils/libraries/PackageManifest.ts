import { TrustLevel } from './types';

/**
 * The signed manifest of a package version.
 *
 * Everything else the registry answers travels unsigned, so whoever can alter a response can
 * claim any trust level or signature status. The manifest is the registry's statement about
 * one version (name, version, archive hash, trust level and audit status) signed as a whole
 * with the official DisChord key: once its signature checks out, those facts can be trusted,
 * and the archive is tied to the exact name and version that was asked for.
 */

/** The only manifest format this CLI understands. */
export const SUPPORTED_MANIFEST_SCHEMA = 1;

/** What the registry states about one stored version of a package. */
export interface PackageManifest {
    /** Version of the manifest format. */
    schema: number;
    /** The package name. */
    name: string;
    /** The version tag the manifest describes. */
    version: string;
    /** Lowercase hex-encoded SHA-256 of the version's archive. */
    sha256: string;
    /** The trust level of the package's repository. */
    trustLevel: TrustLevel;
    /** Whether the archive itself is signed (automatically or after a manual audit). */
    isAudited: boolean;
}

/** A manifest exactly as the registry signed it, with its detached signature. */
export interface SignedManifest {
    /** The serialized manifest. The signature covers these exact bytes. */
    manifest: string;
    /** The ASCII-armored detached signature of the serialized manifest. */
    signature: string;
}

/**
 * Error thrown when a manifest is malformed or does not describe the package being installed.
 * @class ManifestError
 * @extends Error
 */
export class ManifestError extends Error {
    /**
     * @param {string} message - Human-readable explanation of what is wrong with the manifest.
     */
    constructor (message: string) {
        super(message);
        this.name = 'ManifestError';
    }
}

/**
 * Parses the serialized manifest of a package version and validates its shape.
 * Must only be called on text whose signature has already been verified.
 * @param {string} text - The serialized manifest, exactly as it was signed.
 * @throws {ManifestError} If the text is not a manifest this CLI understands.
 * @returns {PackageManifest} The parsed manifest.
 */
export function parseManifest (text: string): PackageManifest {
    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        throw new ManifestError('El manifiesto del paquete no es un JSON válido.');
    }

    if (typeof data !== 'object' || data === null) throw new ManifestError('El manifiesto del paquete no tiene el formato esperado.');

    const manifest = data as Record<string, unknown>;

    if (manifest.schema !== SUPPORTED_MANIFEST_SCHEMA) {
        throw new ManifestError(`El manifiesto del paquete usa un formato (${String(manifest.schema)}) que esta versión de la CLI no entiende. Actualiza la CLI.`);
    }

    const isValid = typeof manifest.name === 'string'
        && typeof manifest.version === 'string'
        && typeof manifest.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(manifest.sha256)
        && typeof manifest.trustLevel === 'number' && manifest.trustLevel in TrustLevel
        && typeof manifest.isAudited === 'boolean';

    if (!isValid) throw new ManifestError('El manifiesto del paquete no tiene el formato esperado.');

    return {
        schema: SUPPORTED_MANIFEST_SCHEMA,
        name: manifest.name as string,
        version: manifest.version as string,
        sha256: (manifest.sha256 as string).toLowerCase(),
        trustLevel: manifest.trustLevel as TrustLevel,
        isAudited: manifest.isAudited as boolean
    };
}

/**
 * Checks that a manifest is the one for the package being installed: same name, same version,
 * and the hash of the archive that was actually downloaded. This is what prevents a validly
 * signed manifest (or archive) of another package or version from being served instead.
 * @param {PackageManifest} manifest - The verified manifest.
 * @param {string} name - The package name that was requested.
 * @param {string} version - The version tag being installed.
 * @param {string} archiveSha256 - Lowercase hex-encoded SHA-256 of the downloaded archive.
 * @throws {ManifestError} If the manifest describes something else.
 * @returns {void}
 */
export function assertManifestDescribes (manifest: PackageManifest, name: string, version: string, archiveSha256: string): void {
    if (manifest.name !== name || manifest.version !== version) {
        throw new ManifestError(`El manifiesto firmado corresponde a ${manifest.name}@${manifest.version}, no a ${name}@${version}. Instalación abortada.`);
    }

    if (manifest.sha256 !== archiveSha256.toLowerCase()) {
        throw new ManifestError(`El paquete descargado no coincide con el hash del manifiesto firmado (esperado ${manifest.sha256}, obtenido ${archiveSha256}). Instalación abortada.`);
    }
}
