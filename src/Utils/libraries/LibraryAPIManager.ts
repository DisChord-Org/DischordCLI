import fs from 'fs';
import path from 'path';
import * as openpgp from 'openpgp';

import requester from '../requester';
import { PackageResponse, PackagesRecordResponse } from './types';

class LibraryAPIManager {
    private static readonly DISCHORD_PUBLIC_KEY = fs.readFileSync(path.join(process.cwd(), 'public.key'), 'utf8');

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