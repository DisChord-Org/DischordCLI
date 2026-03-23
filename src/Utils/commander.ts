import child_process from "node:child_process";

export type SONode = 'windows' | 'linux' | 'macos';

/**
 * Utility class responsible for executing system commands across different operating systems.
 * It abstracts the complexity of platform-specific shell commands for Windows, Linux, and macOS.
 */
class Commander {
    /** The current operating system platform identifier. */
    static OS: NodeJS.Platform = process.platform;
    /** Flag indicating if the current OS is Windows. */
    static isWindows: boolean = Commander.OS === 'win32';
    /** Flag indicating if the current OS is macOS. */
    static isMacOS: boolean = Commander.OS === 'darwin';

    /**
     * Executes a synchronous shell command based on the current operating system.
     * @param command A record containing the command strings for each supported platform.
     * @param params Optional execution settings for the child process.
     * @returns The output buffer of the executed command.
     * @throws Error if the platform command is missing or execution fails.
     */
    static run (command: Record<SONode, string | 'same'>, params?: child_process.ExecSyncOptionsWithBufferEncoding) {
        let cmd: string;

        if (this.isWindows) cmd = command.windows;
        else if (this.isMacOS) {
            const macStrategy = command.macos || command.linux;
            cmd = macStrategy === 'same'? command.windows : macStrategy;
        } else cmd = command.linux === 'same'? command.windows : command.linux;

        if (cmd === 'same' && this.isWindows) throw new Error('La propiedad "windows" no puede ser "same" en Windows.');

        try {
            return child_process.execSync(cmd, params);
        } catch (e: any) {
            /**
             * Handle process interruption (Ctrl+C).
             * Windows exit code: 3221225786
             * Linux/macOS exit code: 130
             */
            if (e.status === 3221225786 || e.status === 130) {
                process.exit(0); 
            }

            throw e;
        }
    }

    /**
     * Tests if a command can be executed successfully without throwing an error.
     * @param command A record containing the platform-specific commands to test.
     * @returns True if the command executed with exit code 0, false otherwise.
     */
    static test(command: Record<SONode, string>): boolean {
        try {
            this.run(command, { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }
}

export default Commander;