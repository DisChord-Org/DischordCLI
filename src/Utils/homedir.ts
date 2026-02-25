import path from 'path';
import os from 'os';
import Commander from './commander';
import fs from 'fs';
import { gray, red, yellow } from './drawer';

class homedir {
    public _homedir: string = os.homedir();
    public _DisChordBinFolder: string = this._homedir;
    public _DisChordBinPath: string = this._homedir;

    constructor () {
        if (Commander.isWindows) {
            this._DisChordBinFolder = path.join(this._homedir, '.dischord', 'bin', 'DisChordCompiler');
        } else {
            this._DisChordBinFolder = path.join(this._homedir, '.local', 'bin', 'DisChordCompiler');
        }

        if (!fs.existsSync(this._DisChordBinFolder)) {
            console.log(yellow('ADVERTENCIA: ') + red('No se encontró la carpeta de DisChord CLI en tu directorio de usuario. Creando carpeta...'));
            fs.mkdirSync(this._DisChordBinFolder, { recursive: true });
            console.log(yellow('SOLUCIONADO: ') + red('Carpeta de DisChord CLI creada en: ') + gray(this._DisChordBinFolder));
        }

        this._DisChordBinPath = path.join(this._DisChordBinFolder, 'dischord_compilder');
    }
}

const hd = new homedir();
export default hd;