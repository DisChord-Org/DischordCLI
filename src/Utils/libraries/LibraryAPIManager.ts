import path from 'path';
import fs from 'fs';

import requester from '../requester';
import homedir from "../homedir";
import { PackageResponse, PackagesRecordResponse, RepositoryData, RepositoryDataFromJSON } from './types';

class LibraryAPIManager {
    constructor () {}

    public static async existsRepo (name: PackageResponse['name']): boolean {
        const repo = await requester.get(`/packages/${name}`);

        console.log(repo);
    }

    public static async getPackages (): Promise<PackagesRecordResponse> {
        return await requester.get(`/packages`);
    }
}

export default LibraryAPIManager;