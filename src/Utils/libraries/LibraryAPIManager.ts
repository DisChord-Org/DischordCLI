import fs from 'fs';
import * as openpgp from 'openpgp';
import semver from 'semver';

import requester from '../requester';
import LibraryLocalManager from './LibraryLocalManager';
import { PublicKey } from './PublicKey';
import { PackageResponse, PackagesRecordResponse, TrustLevel } from './types';
import { bold, cyan, gray, green, italic, red } from '../drawer';

/**
 * Interface for interacting with the remote DisChord Package Registry API.
 * This class handles package metadata retrieval and cryptographic signature verification
 * to ensure the integrity of downloaded libraries.
 * @class LibraryAPIManager
 */
class LibraryAPIManager {
    /** 
     * The official DisChord PGP public key used to verify signed packages.
     * Loaded synchronously from the CLI's root directory using ESM-compatible path resolution.
     * @type {string}
     * @private
     * @readonly
     */
    private static readonly DISCHORD_PUBLIC_KEY = PublicKey;

    constructor () {}

    /**
     * Formats a package response into a stylized string for terminal output.
     * Includes the package name, version, description, repository URL, and trust/audit status.
     * @param {PackageResponse} repo - The package data to format.
     * @returns {string} A colorized and formatted string ready for the console.
     */
    public static toString (repo: PackageResponse): string {
        const versionTags = Object.keys(repo.versions).sort(semver.compare);
        const chunkedVersions = [];

        for (let x = 0; x < versionTags.length; x += 5) {
            const line = versionTags.slice(x, x + 5).join('    ');

            chunkedVersions.push(`      ${LibraryLocalManager.existsRepo(repo.name, line)? cyan(line) : gray(line)}`);
        }
    
        return `+ ${green(`${repo.name} (${repo.version})`)} ${bold('-')} ${italic(gray(repo.description))}\n    - ${cyan(repo.repository)}\n    - ${cyan(TrustLevel[repo.trustLevel])}\n    - ${repo.isAudited? cyan('Firmado') : red('Sin firmar')}\n    - ${cyan('Versiones:')}\n${chunkedVersions.join('\n')}`;
    }

    /**
     * Retrieves detailed metadata for a specific package from the remote registry.
     * @async
     * @param {string} name - The unique name of the package to search for.
     * @returns {Promise<PackageResponse | undefined>} A promise resolving to the package data or undefined if not found.
     */
    public static async getPackage (name: PackageResponse['name'], version: PackageResponse['version']): Promise<PackageResponse | undefined> {
        const response = await requester.get(`/packages/${name}/${version}`);

        return response as PackageResponse | undefined;
    }

    /**
     * Fetches the complete list of available packages from the registry.
     * @async
     * @returns {Promise<PackagesRecordResponse>} A promise resolving to a record of all registered packages.
     */
    public static async getPackages (): Promise<PackagesRecordResponse> {
        return await requester.get(`/packages`);
    }

    /**
     * Performs a cryptographic verification of a file's integrity using OpenPGP.
     * Validates that the file has been signed by the official DisChord key and has not been tampered with.
     * 
     * @async
     * @param {string} filePath - The local absolute path to the file to be verified (e.g., a .zip package).
     * @param {string} signatureBase64 - The ASCII-armored signature string, typically received in Base64.
     * @returns {Promise<boolean>} Resolves to true if the signature is valid, false otherwise.
     * 
     * @example
     * const isValid = await LibraryAPIManager.verifySignature('./lib.zip', sigString);
     * if (!isValid) throw new Error("Security breach detected!");
     */
    public static async verifySignature(filePath: string, signatureBase64: string): Promise<boolean> {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const publicKey = await openpgp.readKey({ armoredKey: this.DISCHORD_PUBLIC_KEY });
            const signature = await openpgp.readSignature({ armoredSignature: signatureBase64.replace(/\\n/g, '\n').trim() });
            const message = await openpgp.createMessage({ binary: new Uint8Array(fileBuffer) });

            const verification = await openpgp.verify({
                message,
                signature,
                verificationKeys: publicKey,
                format: 'binary'
            });

            const { verified } = verification.signatures[0];
            
            await verified;
            return true;
        } catch (error) {
            return false;
        }
    }
}

export default LibraryAPIManager;