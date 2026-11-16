import { spawnSync, type StdioOptions } from 'node:child_process';

/** Operating systems the DisChord toolchain is distributed for. */
export type SONode = 'windows' | 'linux' | 'macos';

/** Options accepted by {@link Commander.exec}. */
export interface ExecOptions {
    /** Working directory of the child process. Defaults to the current one. */
    cwd?: string;
    /** Environment of the child process. Defaults to the current one. */
    env?: NodeJS.ProcessEnv;
    /**
     * Standard streams configuration. Defaults to discarding stdin, capturing stdout (returned
     * to the caller) and inheriting stderr, so a tool's own output never leaks into stdout.
     */
    stdio?: StdioOptions;
    /**
     * Runs the command through the system shell. Only meant for Windows '.cmd' shims (ej. pnpm),
     * which cannot be spawned directly. The arguments are NOT escaped in this mode, so callers
     * must only pass values they fully control.
     */
    shell?: boolean;
}

/**
 * Error thrown when a child process cannot be started or exits unsuccessfully.
 * @class CommandError
 * @extends Error
 */
export class CommandError extends Error {
    /** The executable that was run. */
    public readonly command: string;
    /** The exit code of the process, or null if it never started or was killed by a signal. */
    public readonly status: number | null;

    /**
     * @param {string} command - The executable that was run.
     * @param {number | null} status - Its exit code, if any.
     * @param {string} message - Human-readable description of the failure.
     */
    constructor (command: string, status: number | null, message: string) {
        super(message);
        this.name = 'CommandError';
        this.command = command;
        this.status = status;
    }
}

/**
 * Utility class responsible for running external programs across operating systems.
 *
 * Programs are spawned directly with an argument array instead of through a shell command
 * string, so paths containing spaces or shell metacharacters are passed through verbatim and
 * can never be interpreted as additional commands.
 */
class Commander {
    /** The current operating system platform identifier. */
    static readonly OS: NodeJS.Platform = process.platform;
    /** Flag indicating if the current OS is Windows. */
    static readonly isWindows: boolean = Commander.OS === 'win32';
    /** Flag indicating if the current OS is macOS. */
    static readonly isMacOS: boolean = Commander.OS === 'darwin';

    /** Exit code used by Windows when a process is interrupted with Ctrl+C (STATUS_CONTROL_C_EXIT). */
    private static readonly WINDOWS_CTRL_C_STATUS = 3221225786;
    /** Conventional exit code for a process interrupted by SIGINT (128 + 2). */
    private static readonly SIGINT_EXIT_CODE = 130;

    /**
     * Resolves the DisChord name of the current operating system, as used by the download API.
     * @returns {SONode} The current platform's identifier.
     */
    static get platform (): SONode {
        if (Commander.isWindows) return 'windows';
        return Commander.isMacOS ? 'macos' : 'linux';
    }

    /**
     * Runs a program synchronously and returns what it wrote to stdout.
     * If the user interrupts the program (Ctrl+C), the CLI itself exits with the conventional
     * interruption code instead of reporting a failure.
     * @param {string} file - The executable to run (a path, or a name resolved through PATH).
     * @param {readonly string[]} [args] - The arguments, passed verbatim (see {@link ExecOptions.shell}).
     * @param {ExecOptions} [options] - Execution settings for the child process.
     * @throws {CommandError} If the program cannot be started or exits with a non-zero code.
     * @returns {Buffer} The captured stdout (empty when stdout is not piped).
     */
    static exec (file: string, args: readonly string[] = [], options: ExecOptions = {}): Buffer {
        const result = spawnSync(file, [...args], {
            cwd: options.cwd,
            env: options.env,
            stdio: options.stdio ?? ['ignore', 'pipe', 'inherit'],
            shell: options.shell ?? false,
            windowsHide: true
        });

        if (result.error) {
            throw new CommandError(file, null, `No se pudo ejecutar "${file}": ${result.error.message}`);
        }

        if (result.status === Commander.WINDOWS_CTRL_C_STATUS || result.status === Commander.SIGINT_EXIT_CODE || result.signal === 'SIGINT') {
            process.exit(Commander.SIGINT_EXIT_CODE);
        }

        if (result.status !== 0) {
            const reason = result.status === null ? `la señal ${result.signal}` : `el código ${result.status}`;
            throw new CommandError(file, result.status, `"${file}" terminó con ${reason}.`);
        }

        return result.stdout ?? Buffer.alloc(0);
    }

    /**
     * Tests whether a program can be run successfully, discarding all of its output.
     * @param {string} file - The executable to run.
     * @param {readonly string[]} [args] - The arguments to pass.
     * @param {ExecOptions} [options] - Execution settings for the child process.
     * @returns {boolean} True if the program started and exited with code 0.
     */
    static succeeds (file: string, args: readonly string[] = [], options: ExecOptions = {}): boolean {
        try {
            Commander.exec(file, args, { ...options, stdio: 'ignore' });
            return true;
        } catch (error) {
            if (error instanceof CommandError) return false;
            throw error;
        }
    }
}

export default Commander;
