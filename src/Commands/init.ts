import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";

export default function init (arg: string) {
    let projectPath: string = arg;

    if (arg === '.') projectPath = process.cwd();
    else if (!path.isAbsolute(projectPath)) projectPath = path.join(process.cwd(), projectPath);

    if (fs.existsSync(projectPath)) return console.log(red('Ya existe un proyecto en esa ruta.'));

    console.log(yellow('────────') + ' Inicializando proyecto ' + yellow('────────'));
    console.log('   ' + italic(`${gray(projectPath)}\n`));

    // Crear carpeta del proyecto
    fs.mkdirSync(projectPath, { recursive: true });
    console.log(green('+') + ` /${path.basename(projectPath)}`);
    
    // Iniciando proyecto con pnpm
    Commander.run({
        windows: `cd ${projectPath} && pnpm init`,
        linux: 'same'
    });
    console.log(green('+') + ` node_modules`);

    // Instalando Seyfert
    Commander.run({
        windows: `cd ${projectPath} && pnpm install seyfert`,
        linux: 'same'
    });
    console.log(green('+') + ` seyfert`);

    // Creando src
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    console.log(green('+') + ` /${path.basename(projectPath)}/src`);

    // Creando index.chord
    fs.writeFileSync(path.join(projectPath, 'src', 'index.chord'), '// Tu código de DisChord aquí\n', 'utf-8');
    console.log(green('+') + ` /${path.basename(projectPath)}/src/index.chord`);

    console.log('\n' + yellow('────────') + ' Proyecto inicializado ' + yellow('────────'));
}