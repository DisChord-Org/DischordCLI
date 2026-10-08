import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import { constants as osConstants } from 'os';
import path from 'path';
import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';
import homedir from '../Utils/homedir';
import compile from './compile';

/**
 * Orchestrates the full lifecycle of running a DisChord bot:
 * Validation, Compilation, and Execution.
 * It ensures Node.js is available, triggers the compiler, and then launches
 * the resulting ESM module from the 'dist' directory.
 *
 * Prefers the Node.js binary bundled by the DisChord IDE (see {@link homedir.hasNodeToolchain}),
 * so the bot runs on that known-good toolchain instead of whatever (possibly older, or entirely
 * absent) Node.js is on the system's own PATH. Falls back to the system's 'node' when the
 * bundled toolchain isn't present (ej. the CLI is used standalone, without the IDE).
 * * @param arg The path to the .chord file or directory to be executed.
 * @returns {Promise<void>} A promise that resolves when the bot process starts or fails.
 */
export default async function run (arg: string) {
    const hasBundledNode = homedir.hasNodeToolchain();

    const NodeTest: boolean = hasBundledNode || Commander.test({
        windows: 'node -v',
        linux: 'same',
        macos: 'same'
    });

    if (!NodeTest) {
        return console.log(red('ERROR: ') + 'Node.js no está instalado o no se encuentra en el PATH.\n' + gray('Es necesario Node.js para ejecutar el bot de DisChord.'));
    }

    await compile(arg);

    const resolvedPath = path.resolve(arg);
    const isDirectory = fs.statSync(resolvedPath).isDirectory();
    const dir = isDirectory ? resolvedPath : path.join(resolvedPath, '..');
    const baseDir = path.basename(dir);

    if (baseDir != 'src') return console.log(red(`No se ha encontrado la carpeta src.`) + '\nSe encontró ' + gray(`'${baseDir}'`) + '\nEn ' + gray(resolvedPath));

    const dist = path.join(dir, '../', 'dist');
    if (!fs.existsSync(dist)) return console.log(red('No se ha encontrado la carpeta dist.') + '\nSe encontró ' + gray(`'${path.basename(dist)}'`) + '\nEn ' + gray(dist));

    const indexPath = path.join(dist, 'index.js');
    if (!fs.existsSync(indexPath)) return console.log(red('No se ha encontrado el archivo index.js en la carpeta dist.') + '\nSe encontró ' + gray(`'${path.basename(indexPath)}'`) + '\nEn ' + gray(indexPath));

    /**
     * Final Execution:
     * Spawns Node.js directly (no shell, no backgrounding) with the project root as cwd, so the
     * bot stays a direct child of 'chord'. Termination signals are forwarded to it and 'chord'
     * exits with the child's exit code, so no orphaned bot processes are left behind.
     */
    const nodeBinary = hasBundledNode ? homedir.getNodeBinaryPath() : 'node';
    const child = spawn(nodeBinary, [indexPath], {
        cwd: path.join(dist, '../'),
        stdio: 'inherit'
    });

    let exiting = false;

    const terminate = (signal: NodeJS.Signals) => {
        if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;

        if (Commander.isWindows) {
            try {
                spawnSync(
                    'taskkill',
                    [ '/pid', String(child.pid), '/T', '/F' ],
                    { stdio: 'ignore' }
                );
            } catch {}
        } else {
            try {
                child.kill(signal);
            } catch {}
        }
    };

    const signals: NodeJS.Signals[] = Commander.isWindows ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const signal of signals) {
        process.on(signal, () => {
            exiting = true;
            terminate(signal);
        });
    }

    // last resort: never leave the child behind if chord itself exits first.
    process.on('exit', () => terminate('SIGTERM'));

    child.on('error', (err) => {
        console.log(red('ERROR: ') + 'No se pudo iniciar Node.js.\n' + gray(err.message));
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        if (code !== null) process.exit(code);
        // killed by a signal: mirror the shell convention (128 + signal number).
        const num = signal ? (osConstants.signals[signal] ?? 0) : 0;
        process.exit(exiting || num === 0 ? 0 : 128 + num);
    });
}
