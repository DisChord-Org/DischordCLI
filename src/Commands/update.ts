import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { updateAvailable } from "../Utils/utils";
import pkg from '../../package.json';
import homedir from '../Utils/homedir';

async function updateComponent (component: 'cli' | 'ide' | 'compiler', version: string, binPath: string, folder: string) {
    await Requester.downloadComponent(component, version, binPath);
    fs.writeFileSync(path.join(folder, 'version'), version, 'utf-8');
    console.log(green('Actualización completada.'));
}

export default async function update (arg: 'cli' | 'ide' | 'compiler' | 'all') {
    switch (arg) {
        case 'cli':
            // en el caso de linux se puede sobreescribir el binerio directamente
            // en el caso de windows se moverá el binario actual a 'bin'.old y el nuevo a 'bin'
            const CLIVersion = await Requester.getVersion('cli');

            if (updateAvailable(pkg.version, CLIVersion.version) === 'update-available') {

            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'compiler':
            const CompilerVersion = await Requester.getVersion('compiler');

            if (!fs.existsSync(homedir._DisChordBinPath)) {
                console.log(red('No existe el compilador en este sistema. Instalando...'));
                updateComponent('compiler', CompilerVersion.version, homedir._DisChordBinPath, homedir._DisChordBinFolder);
                return;
            }

            if (!fs.existsSync(path.join(homedir._DisChordBinFolder, 'version'))) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                updateComponent('compiler', CompilerVersion.version, homedir._DisChordBinPath, homedir._DisChordBinFolder);
                return;
            }

            if (updateAvailable(pkg.version, CompilerVersion.version) === 'update-available') {
                console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + CompilerVersion.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
                updateComponent('compiler', CompilerVersion.version, homedir._DisChordBinPath, homedir._DisChordBinFolder);
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'ide':
            break;
        case 'all':
            const versions = await Requester.getAllVersions();
            break;
    }
}