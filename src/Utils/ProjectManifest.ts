import fs from 'fs';
import path from 'path';

import Commander from './commander';
import homedir from './homedir';

/** Options accepted by {@link ProjectManifest.install}. */
export interface PnpmInstallOptions {
    /**
     * Skips every lifecycle script ('preinstall', 'postinstall', 'prepare'...). Must be set when
     * installing the dependencies of a downloaded package, so that merely installing it cannot
     * run arbitrary code on the user's machine.
     */
    ignoreScripts?: boolean;
}

/**
 * Utility class responsible for managing a project's 'package.json' and its pnpm-installed
 * dependencies. Centralizes the logic shared by 'chord init', 'chord compile',
 * 'chord pkg install' and 'chord pkg sync' (running 'pnpm init'/'pnpm install' and forcing
 * '"type": "module"').
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
     * Shape of a package argument accepted by {@link install}: an optionally scoped npm name
     * with an optional '@version'. On Windows pnpm is a '.cmd' shim that has to be run through
     * the shell, so anything that could carry shell metacharacters is rejected outright.
     */
    private static readonly PACKAGE_ARG_REGEX = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$/;

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
     * @private
     */
    private static pnpmEnv (): NodeJS.ProcessEnv {
        if (!homedir.hasNodeToolchain()) return process.env;

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PATH: `${homedir.getNodeToolchainBinDir()}${path.delimiter}${process.env.PATH ?? ''}`
        };

        for (const key of ProjectManifest.NPM_ENV_VARS_TO_STRIP) delete env[key];

        return env;
    }

    /**
     * Resolves the pnpm executable to run. On Unix the bundled toolchain's own pnpm is used by
     * its absolute path when present; on Windows the name is left for the shell to resolve to
     * the '.cmd' shim through the PATH built by {@link pnpmEnv}.
     * @returns {string} The executable path or name.
     * @private
     */
    private static pnpmExecutable (): string {
        if (Commander.isWindows || !homedir.hasNodeToolchain()) return 'pnpm';

        const bundled = path.join(homedir.getNodeToolchainBinDir(), 'pnpm');
        return fs.existsSync(bundled) ? bundled : 'pnpm';
    }

    /**
     * Runs pnpm inside a project directory. The directory is passed as the working directory
     * of the process, never as part of a command line.
     * @param {string} projectDir - The directory to run pnpm in.
     * @param {string[]} args - The pnpm arguments. Must be values fully controlled by the CLI.
     * @throws {CommandError} If pnpm cannot be started or fails.
     * @returns {void}
     * @private
     */
    private static runPnpm (projectDir: string, args: string[]): void {
        Commander.exec(ProjectManifest.pnpmExecutable(), args, {
            cwd: projectDir,
            env: ProjectManifest.pnpmEnv(),
            shell: Commander.isWindows
        });
    }

    /**
     * Checks whether pnpm can be run on this system (bundled with the IDE or globally installed).
     * @returns {boolean} True if 'pnpm --version' runs successfully.
     */
    public static isPnpmAvailable (): boolean {
        return Commander.succeeds(ProjectManifest.pnpmExecutable(), ['--version'], {
            env: ProjectManifest.pnpmEnv(),
            shell: Commander.isWindows
        });
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
     * @throws {CommandError} If 'pnpm init' fails.
     * @returns {void}
     */
    public static ensure (projectDir: string): void {
        if (!ProjectManifest.exists(projectDir)) ProjectManifest.runPnpm(projectDir, ['init']);

        ProjectManifest.setModuleType(projectDir);
    }

    /**
     * Forces '"type": "module"' on a directory's 'package.json'. No-op if already set or if
     * there is no manifest.
     * @param {string} projectDir - The directory whose manifest should be patched.
     * @throws {SyntaxError} If the existing 'package.json' is not valid JSON.
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
     * Checks whether a project declares a dependency and has it installed in 'node_modules'.
     * @param {string} projectDir - The project directory.
     * @param {string} name - The npm package name to look for.
     * @returns {boolean} True if the dependency is both declared and present on disk.
     */
    public static hasDependency (projectDir: string, name: string): boolean {
        return Object.prototype.hasOwnProperty.call(ProjectManifest.getDependencies(projectDir), name)
            && fs.existsSync(path.join(projectDir, 'node_modules', name));
    }

    /**
     * Installs one or more packages into a project via pnpm. With no packages given, runs a
     * plain 'pnpm install' (ej. to resolve an existing 'package.json').
     * @param {string} projectDir - The directory to install into.
     * @param {string[]} [packages] - Packages to add, optionally in 'name@version' format.
     * @param {PnpmInstallOptions} [options] - Installation options.
     * @throws {Error} If a package argument has an unexpected shape.
     * @throws {CommandError} If pnpm fails.
     * @returns {void}
     */
    public static install (projectDir: string, packages: string[] = [], options: PnpmInstallOptions = {}): void {
        for (const pkg of packages) {
            if (!ProjectManifest.PACKAGE_ARG_REGEX.test(pkg)) throw new Error(`"${pkg}" no es un nombre de paquete npm válido.`);
        }

        const args = ['install', ...packages];
        if (options.ignoreScripts) args.push('--ignore-scripts');

        ProjectManifest.runPnpm(projectDir, args);
    }
}

export default ProjectManifest;
