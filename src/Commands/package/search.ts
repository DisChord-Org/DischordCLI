import semver from 'semver';

import LibraryAPIManager from '../../Utils/libraries/LibraryAPIManager';
import LibraryLocalManager from '../../Utils/libraries/LibraryLocalManager';
import { type PackageResponse, TrustLevel } from '../../Utils/libraries/types';
import { bold, gray } from '../../Utils/drawer';
import { emitJson } from '../../Utils/ndjson';

/** Options accepted by the {@link pkgSearch} command. */
interface SearchOptions {
    /** If true, searches only locally installed packages instead of the remote registry. */
    installed: boolean;
    /** Whether to print the results as a single JSON array instead of human-readable text. */
    json?: boolean;
}

/**
 * Tells whether a package matches a search query.
 * A query that is a semantic version matches packages whose current version equals it.
 * Any other query is matched, ignoring case, against the package name, description and
 * repository URL (anywhere in the text) and against the trust level (as a prefix).
 * @param {PackageResponse} library - The package to test.
 * @param {string} query - The search term or version.
 * @returns {boolean} True if the package matches.
 */
export function matchesQuery (library: PackageResponse, query: string): boolean {
    const queryVersion = semver.valid(query);

    if (queryVersion) {
        const libraryVersion = semver.valid(library.version);
        return !!libraryVersion && semver.eq(libraryVersion, queryVersion);
    }

    const term = query.toLowerCase();
    const contains = (value: unknown): boolean => typeof value === 'string' && value.toLowerCase().includes(term);

    return contains(library.name)
        || contains(library.description)
        || contains(library.repository)
        || (TrustLevel[library.trustLevel] ?? '').toLowerCase().startsWith(term);
}

/**
 * Searches for libraries in either the remote registry or the local storage.
 *
 * This function filters packages based on a query string which can represent
 * a name, description, repository URL, trust level, or a specific semantic version
 * (see {@link matchesQuery}).
 *
 * @async
 * @param {string | undefined} query - The search term or version to filter by.
 * @param {SearchOptions} options - Command options. 'json' switches the output to a single
 * JSON array of {@link PackageResponse} objects for external integrations (ej. DisChord Code
 * Studio), instead of the human-readable, colorized text blocks.
 * @throws {Error} If the remote registry cannot be reached.
 * @returns {Promise<boolean>} Always true; an empty result is not a failure.
 */
export default async function pkgSearch (query: string | undefined, options: SearchOptions): Promise<boolean> {
    const libraries = options.installed ? LibraryLocalManager.getPackages() : await LibraryAPIManager.getPackages();
    const allLibraries = Object.values(libraries);
    const filteredLibraries = query ? allLibraries.filter(library => matchesQuery(library, query)) : allLibraries;

    if (options.json) {
        emitJson<PackageResponse[]>(filteredLibraries);
        return true;
    }

    if (filteredLibraries.length === 0) {
        console.log(bold('-') + gray(' Sin resultados.'));
        return true;
    }

    console.log(
        filteredLibraries
            .map(library => options.installed ? LibraryLocalManager.toString(library) : LibraryAPIManager.toString(library))
            .join('\n')
    );

    return true;
}
