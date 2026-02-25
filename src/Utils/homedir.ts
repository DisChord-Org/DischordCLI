import path from 'path';
import os from 'os';
import Commander from './commander';
import fs from 'fs';
import { gray, red, yellow } from './drawer';

class homedir {
    public _homedir: string = os.homedir();
    public _DisChordCompilerFolder: string = this._homedir;
    public _DisChordCompilerPath: string = this._homedir;
    public _DisChordCLIFolder: string = this._homedir;
    public _DisChordCLIPath: string = this._homedir;

    constructor () {
        if (Commander.isWindows) {
            this._DisChordCompilerFolder = path.join(this._homedir, '.dischord', 'bin', 'DisChordCompiler');
            this._DisChordCLIFolder = path.join(this._homedir, '.dischord', 'bin', 'DisChordCLI');
        } else {
            this._DisChordCompilerFolder = path.join(this._homedir, '.local', 'bin', 'DisChordCompiler');
            this._DisChordCLIFolder = path.join(this._homedir, '.local', 'bin', 'DisChordCLI');
        }

        if (!fs.existsSync(this._DisChordCompilerFolder)) {
            console.log(yellow('ADVERTENCIA: ') + red('No se encontró la carpeta de DisChord Compiler en tu directorio de usuario. Creando carpeta...'));
            fs.mkdirSync(this._DisChordCompilerFolder, { recursive: true });
            console.log(yellow('SOLUCIONADO: ') + red('Carpeta de DisChord Compiler creada en: ') + gray(this._DisChordCompilerFolder));
        }

        if (!fs.existsSync(this._DisChordCLIFolder)) {
            console.log(yellow('ADVERTENCIA: ') + red('No se encontró la carpeta de DisChord CLI en tu directorio de usuario. Creando carpeta...'));
            fs.mkdirSync(this._DisChordCLIFolder, { recursive: true });
            console.log(yellow('SOLUCIONADO: ') + red('Carpeta de DisChord CLI creada en: ') + gray(this._DisChordCLIFolder));
        }

        this._DisChordCompilerPath = path.join(this._DisChordCompilerFolder, 'dischord_compiler');
        this._DisChordCLIPath = path.join(this._DisChordCLIFolder, 'chord');
    }
}

const hd = new homedir();
export default hd;