import child_process from "node:child_process";

export type SONode = 'windows' | 'linux' | 'macos';

class Commander {
    static OS: NodeJS.Platform = process.platform;
    static isWindows: boolean = Commander.OS === 'win32';
    static isMacOS: boolean = Commander.OS === 'darwin';

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
            // ctrl+c error code: 3221225786 (windows)
            // ctrl+c error code: 130 (linux)
            if (e.status === 3221225786 || e.status === 130) {
                process.exit(0); 
            }

            throw e;
        }
    }

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