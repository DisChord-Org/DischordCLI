import Commander from "../Utils/commander";
import path from "path";
import fs from 'fs'
import { gray, green, italic, red, yellow } from "../Utils/drawer";

/**
 * Initializes a new DisChord project structure in the specified directory.
 * This function handles path resolution, folder creation, and the installation 
 * of necessary dependencies like Seyfert via pnpm.
 * * @param arg The path where the project should be initialized (relative or absolute).
 * @returns {void}
 */
export default function init (arg: string) {
    let projectPath: string = arg;

    if (arg === '.') projectPath = process.cwd();
    else if (!path.isAbsolute(projectPath)) projectPath = path.join(process.cwd(), projectPath);

    if (fs.existsSync(projectPath)) return console.log(red('Ya existe un proyecto en esa ruta.'));

    console.log(yellow('────────') + ' Inicializando proyecto ' + yellow('────────'));
    console.log('   ' + italic(`${gray(projectPath)}\n`));

    fs.mkdirSync(projectPath, { recursive: true });
    console.log(green('+') + ` /${path.basename(projectPath)}`);
    
    Commander.run({
        windows: `cd ${projectPath} && pnpm init`,
        linux: 'same',
        macos: 'same'
    });
    console.log(green('+') + ` node_modules`);

    Commander.run({
        windows: `cd ${projectPath} && pnpm install seyfert`,
        linux: 'same',
        macos: 'same'
    });
    console.log(green('+') + ` seyfert`);

    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    console.log(green('+') + ` /${path.basename(projectPath)}/src`);

    fs.writeFileSync(path.join(projectPath, 'src', 'index.chord'), '// Tu código de DisChord aquí\n', 'utf-8');
    console.log(green('+') + ` /${path.basename(projectPath)}/src/index.chord`);

    fs.writeFileSync(path.join(projectPath, '.gitignore'), 'node_modules\npackage.json\npnpm-lock.yaml\nseyfert.config.mjs\ndist\n', 'utf-8');
    console.log(green('+') + ` /${path.basename(projectPath)}/.gitignore`);

    console.log('\n' + yellow('────────') + ' Proyecto inicializado ' + yellow('────────'));
}