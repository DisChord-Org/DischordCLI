import fs from 'fs';
import path from 'path';

import Commander from './commander';

/**
 * Utility class responsible for managing a project's 'package.json' and its pnpm-installed
 * dependencies. Centralizes logic previously duplicated across 'chord init', 'chord pkg install',
 * 'chord pkg use'/'unuse' and 'chord pkg sync' (running 'pnpm init'/'pnpm install', forcing
 * '"type": "module"', and installing/removing dependencies).
 */
class ProjectManifest {
    /**
     * Resolves the absolute path to a directory's 'package.json'.
     * @param {string} projectDir - The directory containing (or that should contain) the manifest.
     * @returns {string} The absolute path to 'package.json'.
     */
    public static packageJsonPath (projectDir: string): string {
        return path.join(projectDir, 'package.json');
    }

    /**
     * Checks whether a directory already has a 'package.json'.
     * @param {string} projectDir - The directory to check.
     * @returns {boolean} True if 'package.json' exists.
     */
    public static exists (projectDir: string): boolean {
        return fs.existsSync(ProjectManifest.packageJsonPath(projectDir));
    }

    /**
     * Ensures a directory has a valid ESM 'package.json'. Runs 'pnpm init' if it's missing,
     * then forces '"type": "module"' (creating or fixing it either way).
     * @param {string} projectDir - The directory to ensure a manifest for.
     * @returns {void}
     */
    public static ensure (projectDir: string): void {
        if (!ProjectManifest.exists(projectDir)) {
            Commander.run({
                windows: `cd "${projectDir}" && pnpm init`,
                linux: 'same',
                macos: 'same'
            });
        }

        ProjectManifest.setModuleType(projectDir);
    }

    /**
     * Forces '"type": "module"' on a directory's 'package.json'. No-op if already set.
     * @param {string} projectDir - The directory whose manifest should be patched.
     * @returns {void}
     */
    public static setModuleType (projectDir: string): void {
        const packageJsonPath = ProjectManifest.packageJsonPath(projectDir);
        if (!fs.existsSync(packageJsonPath)) return;

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.type === 'module') return;

        packageJson.type = 'module';
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
    }

    /**
     * Reads the 'dependencies' map declared in a directory's 'package.json'.
     * @param {string} projectDir - The directory whose manifest should be read.
     * @returns {Record<string, string>} A map of dependency name to version range. Empty if
     * there's no manifest or no 'dependencies' field.
     */
    public static getDependencies (projectDir: string): Record<string, string> {
        const packageJsonPath = ProjectManifest.packageJsonPath(projectDir);
        if (!fs.existsSync(packageJsonPath)) return {};

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            return packageJson.dependencies ?? {};
        } catch {
            return {};
        }
    }

    /**
     * Installs one or more packages into a project via pnpm. With no packages given, runs a
     * plain 'pnpm install' (ej. to resolve an existing 'package.json').
     * @param {string} projectDir - The directory to install into.
     * @param {string[]} [packages] - Packages to add, optionally in 'name@version' format.
     * @returns {void}
     */
    public static install (projectDir: string, packages: string[] = []): void {
        const pkgArgs = packages.length ? ` ${packages.join(' ')}` : '';

        Commander.run({
            windows: `cd "${projectDir}" && pnpm install${pkgArgs}`,
            linux: 'same',
            macos: 'same'
        });
    }

    /**
     * Removes one or more packages from a project via pnpm. No-op if the list is empty.
     * @param {string} projectDir - The directory to remove the packages from.
     * @param {string[]} packages - Names of the packages to remove.
     * @returns {void}
     */
    public static uninstall (projectDir: string, packages: string[]): void {
        if (!packages.length) return;

        Commander.run({
            windows: `cd "${projectDir}" && pnpm remove ${packages.join(' ')}`,
            linux: 'same',
            macos: 'same'
        });
    }
}

export default ProjectManifest;
