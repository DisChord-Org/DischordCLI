import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { updateAvailable } from "../Utils/utils";
import pkg from '../../package.json';
import homedir from '../Utils/homedir';

async function updateComponent (component: 'cli' | 'ide' | 'compiler', version: string, binPath: string, folder: string) {
    fs.unlinkSync(binPath);
    await Requester.downloadComponent(component, version, binPath);
    fs.writeFileSync(path.join(folder, 'version'), version, 'utf-8');
    console.log(green('Actualización completada.'));
}

export default async function update (arg: 'cli' | 'ide' | 'compiler' | 'all') {
    switch (arg) {
        case 'cli':
            return console.log(red('CLI aún no está disponible.'));

            const CLIVersion = await Requester.getVersion('cli');

            if (!fs.existsSync(homedir._DisChordCLIFolder)) {
                console.log(red('No existe el ejecutable de la CLI en este sistema. Instalando...'));
                await updateComponent('cli', CLIVersion.version, homedir._DisChordCLIPath, homedir._DisChordCLIFolder);
                return;
            }

            // en el caso de linux se puede sobreescribir el binerio directamente
            // en el caso de windows se moverá el binario actual a 'bin'.old y el nuevo a 'bin'

            if (updateAvailable(pkg.version, CLIVersion.version) === 'update-available') {

            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'compiler':
            const CompilerVersion = await Requester.getVersion('compiler');

            if (!fs.existsSync(homedir._DisChordCompilerPath)) {
                console.log(red('No existe el compilador en este sistema. Instalando...'));
                await updateComponent('compiler', CompilerVersion.version, homedir._DisChordCompilerPath, homedir._DisChordCompilerFolder);
                return;
            }

            if (!fs.existsSync(path.join(homedir._DisChordCompilerFolder, 'version'))) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('compiler', CompilerVersion.version, homedir._DisChordCompilerPath, homedir._DisChordCompilerFolder);
                return;
            }

            if (updateAvailable(pkg.version, CompilerVersion.version) === 'update-available') {
                console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + CompilerVersion.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
                await updateComponent('compiler', CompilerVersion.version, homedir._DisChordCompilerPath, homedir._DisChordCompilerFolder);
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'ide':
            console.log(red('IDE aún no está disponible.'));
            break;
        case 'all':
            console.log(yellow('────────') + '    Comprobando CLI     ' + yellow('────────'));
            await update('cli');
            console.log(yellow('────────') + ' Comprobando Compilador ' + yellow('────────'));
            await update('compiler');
            console.log(yellow('────────') + '    Comprobando IDE     ' + yellow('────────'));
            await update('ide');
            break;
    }
}