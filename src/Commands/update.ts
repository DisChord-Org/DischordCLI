import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { updateAvailable } from "../Utils/utils";
import pkg from '../../package.json';
import homedir from '../Utils/homedir';

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
                console.log(red('No existe el compilador en este sistema. Actualizando...'));
                Requester.downloadComponent('compiler', 'latest', homedir._DisChordBinPath);
            }

            if (updateAvailable(pkg.version, CompilerVersion.version) === 'update-available') {
                Requester.downloadComponent('compiler', 'latest', homedir._DisChordBinPath);
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'ide':
            break;
        case 'all':
            const versions = await Requester.getAllVersions();
            break;
    }
}