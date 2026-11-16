import fs from 'fs';
import * as openpgp from 'openpgp';

import Requester, { HttpError } from '../requester';
import LibraryLocalManager from './LibraryLocalManager';
import { type SignedManifest } from './PackageManifest';
import { PublicKey } from './PublicKey';
import { type PackageResponse, type PackagesRecordResponse } from './types';
import { formatPackage } from './formatPackage';
import { assertValidPackageName, assertValidVersionTag } from './validation';

/**
 * Interface for interacting with the remote DisChord Package Registry API.
 * This class handles package metadata retrieval and cryptographic signature verification
 * to ensure the integrity of downloaded libraries.
 * @class LibraryAPIManager
 */
class LibraryAPIManager {
    /**
     * The official DisChord PGP public key used to verify signed packages, embedded in the
     * CLI at build time (see {@link PublicKey}).
     * @type {string}
     * @private
     * @readonly
     */
    private static readonly DISCHORD_PUBLIC_KEY = PublicKey;

    /**
     * Formats a registry package into a stylized string for terminal output, highlighting
     * the versions that are already installed locally.
     * @param {PackageResponse} repo - The package data to format.
     * @returns {string} A colorized and formatted string ready for the console.
     */
    public static toString (repo: PackageResponse): string {
        return formatPackage(repo, Object.keys(repo.versions ?? {}), tag => LibraryLocalManager.existsRepo(repo.name, tag));
    }

    /**
     * Builds the registry endpoint of a specific package version.
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @returns {string} The endpoint path, starting with '/'.
     * @private
     */
    private static versionEndpoint (name: string, version: string): string {
        assertValidPackageName(name);
        assertValidVersionTag(version);

        return `/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    }

    /**
     * Builds the URL a package version's archive is downloaded from.
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @returns {string} The absolute download URL.
     */
    public static getDownloadUrl (name: string, version: string): string {
        return `${Requester.url}${LibraryAPIManager.versionEndpoint(name, version)}/download`;
    }

    /**
     * Builds the URL a package version's detached signature is downloaded from.
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @returns {string} The absolute signature URL.
     */
    public static getSignatureUrl (name: string, version: string): string {
        return `${Requester.url}${LibraryAPIManager.versionEndpoint(name, version)}/sign/download`;
    }

    /**
     * Retrieves detailed metadata for a specific package from the remote registry.
     * @async
     * @param {string} name - The unique name of the package to search for.
     * @param {string} version - The target package version.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @throws {Error} If the network request fails or the server responds with an error other than 404.
     * @returns {Promise<PackageResponse | undefined>} A promise resolving to the package data or undefined if not found.
     */
    public static async getPackage (name: PackageResponse['name'], version: PackageResponse['version']): Promise<PackageResponse | undefined> {
        try {
            return await Requester.get<PackageResponse>(LibraryAPIManager.versionEndpoint(name, version));
        } catch (error) {
            if (error instanceof HttpError && error.status === 404) return undefined;

            throw error;
        }
    }

    /**
     * Retrieves the signed manifest of a specific package version (see {@link SignedManifest}).
     * The signature is NOT verified here; callers must check it before trusting the content.
     * @async
     * @param {string} name - The package name.
     * @param {string} version - The version tag.
     * @throws {InvalidPackageReferenceError} If the name or the version are not valid.
     * @throws {Error} If the request fails with an error other than 404, or the answer is malformed.
     * @returns {Promise<SignedManifest | undefined>} The manifest and its signature, or undefined
     * if the registry has none (the version does not exist, or the registry predates manifests).
     */
    public static async getSignedManifest (name: PackageResponse['name'], version: PackageResponse['version']): Promise<SignedManifest | undefined> {
        let answer: Partial<SignedManifest> | null;

        try {
            answer = await Requester.get<Partial<SignedManifest> | null>(`${LibraryAPIManager.versionEndpoint(name, version)}/manifest`);
        } catch (error) {
            if (error instanceof HttpError && error.status === 404) return undefined;

            throw error;
        }

        if (typeof answer?.manifest !== 'string' || typeof answer.signature !== 'string') {
            throw new Error(`El registro devolvió un manifiesto con formato no válido para ${name}@${version}.`);
        }

        return { manifest: answer.manifest, signature: answer.signature };
    }

    /**
     * Fetches the complete list of available packages from the registry.
     * @async
     * @throws {Error} If the network request fails or server responds with error.
     * @returns {Promise<PackagesRecordResponse>} A promise resolving to a record of all registered packages.
     */
    public static async getPackages (): Promise<PackagesRecordResponse> {
        return await Requester.get<PackagesRecordResponse>('/packages');
    }

    /**
     * Resolves the latest published version tag for a specific package.
     * The registry does not accept the literal "latest" as a version in its
     * per-version endpoints, so this looks it up via the package listing,
     * where the server already computes the newest tag for each package.
     * @async
     * @param {string} name - The unique name of the package to resolve.
     * @throws {Error} If the network request fails or server responds with error.
     * @returns {Promise<string | undefined>} The latest version tag, or undefined if the package is not registered or has no versions.
     */
    public static async getLatestVersion (name: PackageResponse['name']): Promise<PackageResponse['version'] | undefined> {
        const packages = await LibraryAPIManager.getPackages();

        return Object.prototype.hasOwnProperty.call(packages, name) ? packages[name]?.version : undefined;
    }

    /**
     * Performs a cryptographic verification of a file's integrity using OpenPGP.
     * Validates that the file has been signed by the official DisChord key and has not been tampered with.
     * Any failure (unreadable file, malformed signature, wrong key, altered content) yields false.
     *
     * @async
     * @param {string} filePath - The local absolute path to the file to be verified (e.g., a .zip package).
     * @param {string} armoredSignature - The ASCII-armored detached signature of the file.
     * @returns {Promise<boolean>} Resolves to true if the signature is valid, false otherwise.
     *
     * @example
     * const isValid = await LibraryAPIManager.verifySignature('./lib.zip', sigString);
     * if (!isValid) throw new Error("Security breach detected!");
     */
    public static async verifySignature (filePath: string, armoredSignature: string): Promise<boolean> {
        let content: Buffer;

        try {
            content = fs.readFileSync(filePath);
        } catch {
            return false;
        }

        return LibraryAPIManager.verifyDetachedSignature(content, armoredSignature);
    }

    /**
     * Verifies a detached OpenPGP signature over some bytes against the official DisChord key.
     * Any failure (malformed signature, wrong key, altered content) yields false.
     * @async
     * @param {Uint8Array} content - The exact bytes that were signed.
     * @param {string} armoredSignature - The ASCII-armored detached signature of those bytes.
     * @returns {Promise<boolean>} Resolves to true if the signature is valid, false otherwise.
     */
    public static async verifyDetachedSignature (content: Uint8Array, armoredSignature: string): Promise<boolean> {
        try {
            const publicKey = await openpgp.readKey({ armoredKey: LibraryAPIManager.DISCHORD_PUBLIC_KEY });
            const signature = await openpgp.readSignature({ armoredSignature: armoredSignature.replace(/\\n/g, '\n').trim() });
            const message = await openpgp.createMessage({ binary: new Uint8Array(content) });

            const verification = await openpgp.verify({
                message,
                signature,
                verificationKeys: publicKey,
                format: 'binary'
            });

            if (verification.signatures.length === 0) return false;

            await verification.signatures[0].verified;
            return true;
        } catch {
            return false;
        }
    }
}

export default LibraryAPIManager;
