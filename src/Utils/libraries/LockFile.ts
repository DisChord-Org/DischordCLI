import fs from 'fs';
import path from 'path';

/**
 * Manages the project-level dependency lock file ('dischord.lock.conf').
 *
 * Unlike the global library storage (see {@link LibraryLocalManager}), this file
 * lives in the project root and declares which package versions the project
 * depends on, so 'chord pkg sync' can restore all of them (install + link) on
 * a fresh checkout - similar to how 'npm install' reads 'package.json' or
 * 'pip install -r requirements.txt' reads its requirements file. It is kept
 * in sync automatically by 'chord pkg use'/'chord pkg unuse'.
 *
 * Format: one 'name: version;' entry per line, e.g.
 *   ent: v1.0.3;
 *   sf: v1.0.0;
 *
 * @class LockFile
 */
class LockFile {
    /** File name of the lock file, always resolved relative to the current working directory. */
    private static readonly FILE_NAME = 'dischord.lock.conf';

    /** Matches a single 'name: version;' line, tolerating surrounding whitespace and an optional trailing ';'. */
    private static readonly ENTRY_REGEX = /^([^:;]+):\s*([^;]+);?\s*$/;

    /**
     * Resolves the absolute path to the lock file for the current project.
     * @returns {string} The absolute path to 'dischord.lock.conf' in the current working directory.
     */
    public static getPath (): string {
        return path.join(process.cwd(), LockFile.FILE_NAME);
    }

    /**
     * Parses the lock file into a map of package name to locked version.
     * Blank lines and lines that don't match the 'name: version;' format are ignored.
     * @returns {Record<string, string>} A map of package name to locked version. Empty if the file doesn't exist.
     */
    public static read (): Record<string, string> {
        const filePath = LockFile.getPath();
        if (!fs.existsSync(filePath)) return {};

        const content = fs.readFileSync(filePath, 'utf-8');
        const entries: Record<string, string> = {};

        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const match = trimmed.match(LockFile.ENTRY_REGEX);
            if (!match) continue;

            const [, name, version] = match;
            entries[name.trim()] = version.trim();
        }

        return entries;
    }

    /**
     * Serializes and writes the given entries to the lock file, one 'name: version;' line per
     * entry, sorted alphabetically by package name for stable diffs.
     * @param {Record<string, string>} entries - The map of package name to locked version to persist.
     * @returns {void}
     * @private
     */
    private static write (entries: Record<string, string>): void {
        const names = Object.keys(entries).sort();
        const lines = names.map(name => `${name}: ${entries[name]};`);

        fs.writeFileSync(LockFile.getPath(), lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');
    }

    /**
     * Adds or updates a package entry in the lock file.
     * @param {string} name - The package name.
     * @param {string} version - The version to lock.
     * @returns {void}
     */
    public static setEntry (name: string, version: string): void {
        const entries = LockFile.read();
        entries[name] = version;
        LockFile.write(entries);
    }

    /**
     * Removes a package entry from the lock file, if present.
     * @param {string} name - The package name to remove.
     * @returns {void}
     */
    public static removeEntry (name: string): void {
        const entries = LockFile.read();
        if (!(name in entries)) return;

        delete entries[name];
        LockFile.write(entries);
    }
}

export default LockFile;
