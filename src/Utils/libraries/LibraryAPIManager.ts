import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import requester from '../requester';
import homedir from "../homedir";
import { PackageResponse, PackagesRecordResponse, RepositoryData } from './types';
import { spawn } from 'child_process';

class LibraryAPIManager {
    private static readonly DISCHORD_PUBLIC_KEY = '';

    constructor () {}

    public static async getPackage (name: PackageResponse['name']): Promise<PackageResponse | undefined> {
        const response = await requester.get(`/packages/${name}`);

        return response as PackageResponse | undefined;
    }

    public static async getPackages (): Promise<PackagesRecordResponse> {
        return await requester.get(`/packages`);
    }

    public static async verifySignature(filePath: string, signatureBase64: string): Promise<boolean> {
        try {
            const fileBuffer = fs.readFileSync(filePath);

            return crypto.verify(
                'sha256',
                fileBuffer,
                {
                    key: this.DISCHORD_PUBLIC_KEY,
                    padding: crypto.constants.RSA_PKCS1_PSS_PADDING
                },
                Buffer.from(signatureBase64, 'base64')
            );
        } catch (error) {
            return false;
        }
    }
}

export default LibraryAPIManager;