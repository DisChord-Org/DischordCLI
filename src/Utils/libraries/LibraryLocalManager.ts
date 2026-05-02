import path from 'path';
import fs from 'fs';

import homedir from "../homedir";
import { PackageResponse, PackagesRecordResponse, TrustLevel } from './types';
import { bold, cyan, gray, green, italic, red } from '../drawer';

class LibraryLocalManager {
    public static LibrariesPath: string = path.join(homedir._DisChordRoot, 'libraries');

    constructor () {
        homedir.checkPath(LibraryLocalManager.LibrariesPath, 'folder');
    }

    public static toString (repo: PackageResponse): string {
        return `+ ${green(`${repo.name} (${repo.version})`)} ${bold('-')} ${italic(gray(repo.description))}\n    - ${cyan(repo.repository)}\n    - ${cyan(TrustLevel[repo.trustLevel])}\n    - ${repo.isAudited? cyan('Firmado') : red('Sin firmar')}`;
    }

    public static existsRepo (name: PackageResponse['name'], version: PackageResponse['version'] | undefined = undefined): boolean {
        if (version) return fs.existsSync(path.join(LibraryLocalManager.LibrariesPath, name, version));
        return fs.existsSync(path.join(LibraryLocalManager.LibrariesPath, name));
    }

    static getPackages (): PackagesRecordResponse {
        const librariesRecord: PackagesRecordResponse = {};
        
        fs.readdirSync(this.LibrariesPath).map(file => {
            const library = JSON.parse(fs.readFileSync(path.join(this.LibrariesPath, file, 'data.json'), 'utf8')) as PackageResponse
            librariesRecord[library.name] = library;
        });

        return librariesRecord;
    }
}

new LibraryLocalManager();

export default LibraryLocalManager;