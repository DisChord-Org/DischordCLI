import path from 'path';
import os from 'os';
import Commander from './commander';
import fs from 'fs';
import { gray, red, yellow } from './drawer';

class homedir {
    private isWin: boolean = Commander.isWindows;

    public _homedir: string = os.homedir();
    public _DisChordRoot: string = path.join(this._homedir, '.dischord');
    public _BinFolder: string = this._homedir;

    constructor () {
        // bins on:
        // w: ~/.dischord/bin
        // l: ~/.local/bin
        this._BinFolder = this.isWin
            ? path.join(this._DisChordRoot, 'bin')
            : path.join(this._homedir, '.local', 'bin');

        this.checkPath(this._DisChordRoot, 'folder');
        this.checkPath(this._BinFolder, 'folder');
    }

    private checkPath (_path: string, type: 'folder' | 'file') {
        if (!fs.existsSync(_path)) {
            console.log(yellow('ADVERTENCIA: ') + red(`No se encontró ${type == 'file'? 'el fichero' : 'la carpeta'} en tu sistema. Creando...`));
            if (type === 'file') {
                fs.writeFileSync(_path, '', 'utf-8');
            } else fs.mkdirSync(_path, { recursive: true });
            console.log(yellow('SOLUCIONADO: ') + red('Archivo creado en: ') + gray(_path));
        }
    }

    public existsVersion (component: 'cli' | 'compiler' | 'ide'): boolean {
        return fs.existsSync(path.join(this._DisChordRoot, `${component}-version`));
    }

    public getVersionPath (component: 'cli' | 'compiler' | 'ide'): string {
        return path.join(this._DisChordRoot, `${component}-version`);
    }

    public existsBinary (component: 'chord' | 'dischord-compiler'): boolean {
        const ext = Commander.isWindows ? '.exe' : '';
        return fs.existsSync(path.join(this._BinFolder, `${component}${ext}`));
    }

    public getBinaryPath(component: 'chord' | 'dischord-compiler'): string {
        const ext = Commander.isWindows ? '.exe' : '';
        return path.join(this._BinFolder, `${component}${ext}`);
    }
}

const hd = new homedir();
export default hd;