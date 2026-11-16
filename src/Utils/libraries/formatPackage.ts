import semver from 'semver';

import { type PackageResponse, TrustLevel } from './types';
import { bold, cyan, gray, green, italic, red } from '../drawer';

/** Number of version tags printed per row in the versions listing. */
const VERSIONS_PER_ROW = 5;

/**
 * Orders two version tags from oldest to newest. Tags that are not valid semantic versions
 * are compared alphabetically instead of throwing, and sorted before the valid ones.
 * @param {string} a - The first version tag.
 * @param {string} b - The second version tag.
 * @returns {number} A negative, zero or positive number, as expected by Array.prototype.sort.
 */
export function compareVersionTags (a: string, b: string): number {
    const validA = semver.valid(a);
    const validB = semver.valid(b);

    if (validA && validB) return semver.compare(validA, validB);
    if (validA) return 1;
    if (validB) return -1;

    return a.localeCompare(b);
}

/**
 * Formats a package into a stylized, multi-line string for terminal output: its name and
 * version, description, repository URL, trust level, signature status and known versions.
 * @param {PackageResponse} repo - The package data to format.
 * @param {string[]} versionTags - The version tags to list.
 * @param {(tag: string) => boolean} isInstalled - Tells whether a version tag is installed
 * locally; installed versions are highlighted and the rest are dimmed.
 * @returns {string} A colorized and formatted string ready for the console.
 */
export function formatPackage (repo: PackageResponse, versionTags: string[], isInstalled: (tag: string) => boolean): string {
    const sortedTags = [...versionTags].sort(compareVersionTags);
    const rows: string[] = [];

    for (let index = 0; index < sortedTags.length; index += VERSIONS_PER_ROW) {
        const row = sortedTags
            .slice(index, index + VERSIONS_PER_ROW)
            .map(tag => isInstalled(tag) ? cyan(tag) : gray(tag))
            .join('    ');

        rows.push(`      ${row}`);
    }

    return [
        `+ ${green(`${repo.name} (${repo.version})`)} ${bold('-')} ${italic(gray(repo.description ?? ''))}`,
        `    - ${cyan(repo.repository ?? '')}`,
        `    - ${cyan(TrustLevel[repo.trustLevel] ?? TrustLevel[TrustLevel.Unknown])}`,
        `    - ${repo.isAudited ? cyan('Firmado') : red('Sin firmar')}`,
        `    - ${cyan('Versiones:')}`,
        rows.join('\n')
    ].join('\n');
}
