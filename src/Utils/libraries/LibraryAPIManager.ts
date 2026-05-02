import fs from 'fs';
import path from 'path';
import * as openpgp from 'openpgp';

import requester from '../requester';
import { PackageResponse, PackagesRecordResponse } from './types';
import { PublicKey } from './PublicKey';

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
     * Retrieves detailed metadata for a specific package from the remote registry.
     * @async
     * @param {string} name - The unique name of the package to search for.
     * @returns {Promise<PackageResponse | undefined>} A promise resolving to the package data or undefined if not found.
     */
    public static async getPackage (name: PackageResponse['name']): Promise<PackageResponse | undefined> {
        const response = await requester.get(`/packages/${name}`);

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