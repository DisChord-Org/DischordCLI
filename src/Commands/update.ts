import Commander from "../Utils/commander";
import fs from 'fs'
import { gray, green, red, yellow } from "../Utils/drawer";
import Requester from "../Utils/requester";
import { updateAvailable } from "../Utils/utils";
import homedir from '../Utils/homedir';

async function updateComponent (component: 'cli' | 'ide' | 'compiler', version: string, binPath: string) {
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
    if (fs.existsSync(homedir.getVersionPath(component))) fs.unlinkSync(homedir.getVersionPath(component));
    fs.writeFileSync(homedir.getVersionPath(component), version, 'utf-8');

    console.log(green('Actualización completada.'));
}

export default async function update (arg: 'cli' | 'ide' | 'compiler' | 'all', options: { force: boolean }) {
    switch (arg) {
        case 'cli':
            const CLIVersion = await Requester.getVersion('cli');

            if (!homedir.existsBinary('chord')) {
                console.log(red('No existe el ejecutable de la CLI en este sistema. Instalando...'));
                await updateComponent('cli', CLIVersion.version, homedir.getBinaryPath('chord'));
                return;
            }

            if (!homedir.existsVersion('cli')) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('cli', CLIVersion.version, homedir.getBinaryPath('chord'));
                return;
            }

            const CurrentCLIVersion = fs.readFileSync(homedir.getVersionPath('cli'), 'utf-8');
            if (updateAvailable(CurrentCLIVersion, CLIVersion.version) === 'update-available' || options.force) {
                console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + CLIVersion.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
                await updateComponent('cli', CLIVersion.version, homedir.getBinaryPath('chord'));
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'compiler':
            const CompilerVersion = await Requester.getVersion('compiler');

            if (!homedir.existsBinary('dischord-compiler')) {
                console.log(red('No existe el compilador en este sistema. Instalando...'));
                await updateComponent('compiler', CompilerVersion.version, homedir.getBinaryPath('dischord-compiler'));
                return;
            }

            if (!homedir.existsVersion('compiler')) {
                console.log(red('No se puede obtener la versión instalada, se requiere actualizar'));
                await updateComponent('compiler', CompilerVersion.version, homedir.getBinaryPath('dischord-compiler'));
                return;
            }

            const CurrentCompilerVersion = fs.readFileSync(homedir.getVersionPath('compiler'), 'utf-8');
            if (updateAvailable(CurrentCompilerVersion, CompilerVersion.version) === 'update-available' || options.force) {
                console.log(`${green('Hay una nueva versión disponible:')} ${yellow('v' + CompilerVersion.version)}.\n${gray('Por favor, actualiza tu CLI.')}`);
                await updateComponent('compiler', CompilerVersion.version, homedir.getBinaryPath('dischord-compiler'));
            } else console.log(green('Todo a la orden del día.'));
            break;
        case 'ide':
            console.log(red('IDE aún no está disponible.'));
            break;
        case 'all':
            console.log(yellow('────────') + '    Comprobando CLI     ' + yellow('────────'));
            await update('cli', options);
            console.log(yellow('────────') + ' Comprobando Compilador ' + yellow('────────'));
            await update('compiler', options);
            console.log(yellow('────────') + '    Comprobando IDE     ' + yellow('────────'));
            await update('ide', options);
            break;
    }
}