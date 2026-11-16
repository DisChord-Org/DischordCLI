import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import { constants as osConstants } from 'os';
import path from 'path';

import { gray, red } from '../Utils/drawer';
import Commander from '../Utils/commander';
import homedir from '../Utils/homedir';
import { fail } from '../Utils/output';
import compile, { resolveChordSource } from './compile';

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
 * @async
 * @param {string} arg - The path to the '.chord' file or project directory to be executed.
 * @returns {Promise<boolean>} False if the bot could not be started. When it does start, the
 * CLI process stays attached to it and exits with the bot's own exit code.
 */
export default async function run (arg: string): Promise<boolean> {
    const hasBundledNode = homedir.hasNodeToolchain();

    if (!hasBundledNode && !Commander.succeeds('node', ['-v'])) {
        fail(red('ERROR: ') + 'Node.js no está instalado o no se encuentra en el PATH.\n' + gray('Es necesario Node.js para ejecutar el bot de DisChord.'));
        return false;
    }

    if (!(await compile(arg))) return false;

    const { projectRoot } = resolveChordSource(arg);
    const dist = path.join(projectRoot, 'dist');
    const indexPath = path.join(dist, 'index.js');

    if (!fs.existsSync(dist)) {
        fail(red('No se ha encontrado la carpeta dist.') + '\nEn ' + gray(dist));
        return false;
    }

    if (!fs.existsSync(indexPath)) {
        fail(red('No se ha encontrado el archivo index.js en la carpeta dist.') + '\nEn ' + gray(indexPath));
        return false;
    }

    /**
     * Final Execution:
     * Spawns Node.js directly (no shell, no backgrounding) with the project root as cwd, so the
     * bot stays a direct child of 'chord'. Termination signals are forwarded to it and 'chord'
     * exits with the child's exit code, so no orphaned bot processes are left behind.
     */
    const nodeBinary = hasBundledNode ? homedir.getNodeBinaryPath() : 'node';
    const child = spawn(nodeBinary, [indexPath], {
        cwd: projectRoot,
        stdio: 'inherit'
    });

    let exiting = false;

    const terminate = (signal: NodeJS.Signals): void => {
        if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;

        try {
            if (Commander.isWindows) {
                spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
                child.kill(signal);
            }
        } catch {
            // the child is already gone; nothing left to terminate.
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
        console.error(red('ERROR: ') + 'No se pudo iniciar Node.js.\n' + gray(err.message));
        process.exit(1);
    });

    child.on('exit', (code, signal) => {
        if (code !== null) process.exit(code);
        // killed by a signal: mirror the shell convention (128 + signal number).
        const num = signal ? (osConstants.signals[signal] ?? 0) : 0;
        process.exit(exiting || num === 0 ? 0 : 128 + num);
    });

    return true;
}
