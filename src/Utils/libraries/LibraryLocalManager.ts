import path from 'path';
import fs from 'fs';

import requester from '../requester';
import homedir from "../homedir";
import { PackageResponse, PackagesRecordResponse, RepositoryData, RepositoryDataFromJSON, TrustLevel } from './types';
import { bold, cyan, gray, green, italic, red } from '../drawer';

class LibraryLocalManager {
    public static LibrariesPath: string = path.join(homedir._DisChordRoot, 'libraries');

    constructor () {
        homedir.checkPath(LibraryLocalManager.LibrariesPath, 'folder');
    }

    public static toString (repo: PackageResponse): string {
        return `+ ${green(`${repo.name} (${repo.version})`)} ${bold('-')} ${italic(gray(repo.description))}\n    - ${cyan(repo.repository)}\n    - ${cyan(TrustLevel[repo.trustLevel])}`;
    }

    public static existsRepo (name: PackageResponse['name']): boolean {
        return fs.existsSync(path.join(LibraryLocalManager.LibrariesPath, name));
    }

    static getPackages (): PackagesRecordResponse {
        const librariesRecord: PackagesRecordResponse = {};
        
        fs.readdirSync(this.LibrariesPath).map(filePath => {
            const library = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageResponse
            librariesRecord[library.name] = library;
        });

        return librariesRecord;
    }
}

export default LibraryLocalManager;