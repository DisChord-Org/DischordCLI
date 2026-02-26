import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { updateAvailable } from "../Utils/utils";
import pkg from '../../package.json';
import homedir from '../Utils/homedir';

async function updateComponent (component: 'cli' | 'ide' | 'compiler', version: string, binPath: string, folder: string) {
    const oldPath = `${binPath}.old`;

    // rename exe to exe.old
    if (Commander.isWindows && fs.existsSync(binPath)) {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(binPath, oldPath);
    } else if (fs.existsSync(binPath)) {
        fs.unlinkSync(binPath);
    }

    // downloading
    console.log(gray(`Descargando ${component} v${version}...`));
    await Requester.downloadComponent(component, version, binPath);

    // deleting and creating version again
    console.log(gray(`Actualizando versión local a v${version}...`));
    if (fs.existsSync(path.join(folder, version))) fs.unlinkSync(path.join(folder, version));
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

            if (!fs.existsSync(path.join(homedir._DisChordCLIFolder, 'version'))) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('cli', CLIVersion.version, homedir._DisChordCLIPath, homedir._DisChordCLIFolder);
                return;
            }

            if (updateAvailable(pkg.version, CLIVersion.version) === 'update-available') {
                console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + CLIVersion.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
                await updateComponent('cli', CLIVersion.version, homedir._DisChordCLIPath, homedir._DisChordCLIFolder);
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

            const CurrentCompilerVersion = fs.existsSync(path.join(homedir._DisChordCompilerFolder, 'version'))? fs.readFileSync(path.join(homedir._DisChordCompilerFolder, 'version'), 'utf-8') : '0.0.0';

            if (updateAvailable(CurrentCompilerVersion, CompilerVersion.version) === 'update-available') {
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