import child_process from "node:child_process";

class Commander {
    static OS: NodeJS.Platform = process.platform;
    static isWindows: boolean = Commander.OS === 'win32';

    static run (command: Record<'windows' | 'linux', string>) {
        if (this.isWindows) {
            child_process.execSync(command.windows);
        } else {
            child_process.execSync(command.linux);
        }
    }
}

export default Commander;