import child_process from "node:child_process";

class Commander {
    static OS: NodeJS.Platform = process.platform;
    static isWindows: boolean = Commander.OS === 'win32';

    static run (command: Record<'windows' | 'linux', string | 'same'>, params?: child_process.ExecSyncOptionsWithBufferEncoding) {
        if (this.isWindows) {
            if (command.windows === 'same') throw new Error('La propiedad "windows" no puede ser "same" si el sistema operativo es Windows.');
            child_process.execSync(command.windows, params);
        } else {
            child_process.execSync(command.linux === 'same' ? command.windows : command.linux, params);
        }
    }

    static test(command: Record<'windows' | 'linux', string>): boolean {
        try {
            this.run(command, { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }
}

export default Commander;