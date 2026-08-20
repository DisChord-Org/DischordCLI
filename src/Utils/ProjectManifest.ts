import fs from 'fs';
import path from 'path';

import Commander from './commander';
import homedir from './homedir';

/**
 * Utility class responsible for managing a project's 'package.json' and its pnpm-installed
 * dependencies. Centralizes logic previously duplicated across 'chord init', 'chord pkg install',
 * 'chord pkg use'/'unuse' and 'chord pkg sync' (running 'pnpm init'/'pnpm install', forcing
 * '"type": "module"', and installing/removing dependencies).
 */
class ProjectManifest {
    /**
     * Environment variables stripped before running npm/pnpm (mirrors DisChord Code Studio's
     * own 'NPM_ENV_VARS_TO_STRIP', see its 'src-tauri/src/platform.rs'). If set in the user's
     * own shell (ej. an active corepack setup, or a separately installed global pnpm), these can
     * redirect pnpm's store/global prefix or its resolved npm/node paths, overriding the bundled
     * toolchain even when it's first on PATH.
     */
    private static readonly NPM_ENV_VARS_TO_STRIP = [
        'COREPACK_ROOT',
        'COREPACK_ENABLE_STRICT',
        'COREPACK_ENABLE_AUTO_PIN',
        'COREPACK_ENABLE_NETWORK',
        'COREPACK_NPM_REGISTRY',
        'COREPACK_NPM_TOKEN',
        'npm_config_user_agent',
        'npm_execpath',
        'npm_node_execpath',
        'npm_config_prefix',
        'npm_config_global_prefix',
        'npm_package_json',
        'npm_lifecycle_event',
        'npm_lifecycle_script',
        'PNPM_HOME',
        'PNPM_SCRIPT_SRC_DIR'
    ];

    /**
     * Builds the environment to run pnpm with. When the DisChord IDE's bundled Node.js/pnpm
     * toolchain is present (see {@link homedir.hasNodeToolchain}), its bin folder is prepended
     * to PATH so the plain 'pnpm'/'node' commands below resolve to that bundled toolchain
     * instead of whatever (possibly older, or entirely absent) version is globally installed
     * on the system, and any environment variable that could redirect npm/pnpm elsewhere (see
     * {@link NPM_ENV_VARS_TO_STRIP}) is stripped. Falls back to the current environment
     * untouched otherwise, so the CLI keeps working standalone, without the IDE, by using the
     * system's own pnpm.
     * @returns {NodeJS.ProcessEnv} The environment to pass to the child process.
     */
    private static pnpmEnv (): NodeJS.ProcessEnv {
        if (!homedir.hasNodeToolchain()) return process.env;

        const toolchainBinDir = homedir.getNodeToolchainBinDir();
        const separator = Commander.isWindows ? ';' : ':';

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PATH: `${toolchainBinDir}${separator}${process.env.PATH ?? ''}`
        };

        for (const key of ProjectManifest.NPM_ENV_VARS_TO_STRIP) delete env[key];

        return env;
    }

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
            }, { env: ProjectManifest.pnpmEnv() });
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
        }, { env: ProjectManifest.pnpmEnv() });
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
        }, { env: ProjectManifest.pnpmEnv() });
    }
}

export default ProjectManifest;
