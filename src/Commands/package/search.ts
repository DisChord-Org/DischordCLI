import semver from 'semver';
import LibraryAPIManager from '../../Utils/libraries/LibraryAPIManager';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { TrustLevel } from '../../Utils/libraries/types';
import { bold, gray } from '../../Utils/drawer';

/**
 * Searches for libraries in either the remote registry or the local storage.
 * 
 * This function filters packages based on a query string which can represent 
 * a name, description, repository URL, trust level, or a specific semantic version.
 * 
 * @async
 * @param {string | undefined} query - The search term or version to filter by.
 * @param {Object} options - Command options.
 * @param {boolean} options.installed - If true, searches only locally installed packages.
 * @returns {Promise<void>}
 */
export default async function pkgSearch (query: string | undefined, options: { installed: boolean }): Promise<void> {
    const libraries = options.installed? LibraryLocalManager.getPackages() : await LibraryAPIManager.getPackages();
    let filteredLibraries: string[];

    if (!query) {
        filteredLibraries = Object.keys(libraries)
                                .map(key => LibraryLocalManager.toString(libraries[key]));
    } else if (semver.valid(query)) {
        filteredLibraries = Object.keys(libraries)
                                .filter(key => semver.compare(libraries[key].version, query) === 0)
                                .map(key => LibraryLocalManager.toString(libraries[key]));
    } else {
        filteredLibraries = Object.keys(libraries)
                                .filter(key =>
                                    libraries[key].name.toLowerCase().startsWith(query.toLowerCase()) ||
                                    libraries[key].description.toLowerCase().startsWith(query.toLowerCase()) ||
                                    libraries[key].repository.toLowerCase().startsWith(query.toLowerCase()) ||
                                    TrustLevel[libraries[key].trustLevel].toLowerCase().startsWith(query.toLowerCase()))
                                .map(key => LibraryLocalManager.toString(libraries[key]));
    }

    if (filteredLibraries.length === 0) return console.log(bold('-') + gray(' Sin resultados.'))
    console.log(filteredLibraries.join('\n'));
}