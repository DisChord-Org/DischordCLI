import semver from 'semver';

export function updateAvailable(current: string, latest: string): 'up-to-date' | 'update-available' {
    if (semver.gt(latest, current)) {
        return 'up-to-date';
    } else {
        return 'update-available';
    }
}
