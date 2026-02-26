import child_process from "node:child_process";

class Commander {
    static OS: NodeJS.Platform = process.platform;
    static isWindows: boolean = Commander.OS === 'win32';

    static run (command: Record<'windows' | 'linux', string | 'same'>, params?: child_process.ExecSyncOptionsWithBufferEncoding) {
        const cmd = this.isWindows 
            ? command.windows 
            : (command.linux === 'same' ? command.windows : command.linux);

        if (cmd === 'same' && this.isWindows) throw new Error('La propiedad "windows" no puede ser "same" en Windows.');

        return child_process.execSync(cmd, params);
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