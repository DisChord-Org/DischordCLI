import path from 'path';
import fs from 'fs';

import ProjectManifest from '../Utils/ProjectManifest';
import { gray, green, italic, red, yellow } from '../Utils/drawer';
import { errorMessage, fail } from '../Utils/output';

/** Files created by the operating system that do not make a directory count as 'in use'. */
const IGNORED_ENTRIES: readonly string[] = ['.DS_Store', '.git'];

/** Content of the '.gitignore' generated for every new project. */
const GITIGNORE_CONTENT = 'node_modules\npackage.json\npnpm-lock.yaml\nseyfert.config.mjs\ndist\nlib\n';

/**
 * Initializes a new DisChord project structure in the specified directory.
 * This function handles path resolution, folder creation, and the installation
 * of necessary dependencies like Seyfert via pnpm.
 *
 * The target may be a new directory or an existing empty one (ej. 'chord init .' inside a
 * freshly created folder or an empty git repository). If anything fails halfway, a directory
 * created by this command is removed again so the command can simply be retried.
 * @param {string} arg - The path where the project should be initialized (relative or absolute).
 * @returns {boolean} True if the project was created, false otherwise.
 */
export default function init (arg: string): boolean {
    const projectPath = path.resolve(arg);
    const projectName = path.basename(projectPath);
    const alreadyExisted = fs.existsSync(projectPath);

    if (alreadyExisted) {
        if (!fs.statSync(projectPath).isDirectory()) {
            fail(red('Esa ruta ya existe y no es una carpeta.'));
            return false;
        }

        if (fs.readdirSync(projectPath).some(entry => !IGNORED_ENTRIES.includes(entry))) {
            fail(red('Ya existe un proyecto en esa ruta.') + '\n' + gray('La carpeta no está vacía.'));
            return false;
        }
    }

    if (!ProjectManifest.isPnpmAvailable()) {
        fail(red('ERROR: ') + 'pnpm no está instalado o no se encuentra en el PATH.\n' + gray('Es necesario pnpm para instalar las dependencias del proyecto.'));
        return false;
    }

    console.log(yellow('────────') + ' Inicializando proyecto ' + yellow('────────'));
    console.log('   ' + italic(`${gray(projectPath)}\n`));

    try {
        fs.mkdirSync(projectPath, { recursive: true });
        console.log(green('+') + ` /${projectName}`);

        ProjectManifest.ensure(projectPath);
        ProjectManifest.install(projectPath, ['seyfert']);

        console.log(green('+') + ' node_modules');
        console.log(green('+') + ' seyfert');

        fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
        console.log(green('+') + ` /${projectName}/src`);

        fs.writeFileSync(path.join(projectPath, 'src', 'index.chord'), '// Tu código de DisChord aquí\n', 'utf-8');
        console.log(green('+') + ` /${projectName}/src/index.chord`);

        fs.writeFileSync(path.join(projectPath, '.gitignore'), GITIGNORE_CONTENT, 'utf-8');
        console.log(green('+') + ` /${projectName}/.gitignore`);
    } catch (error) {
        if (!alreadyExisted) fs.rmSync(projectPath, { recursive: true, force: true });

        fail(red('ERROR: ') + 'No se pudo inicializar el proyecto.\n' + gray(errorMessage(error)));
        return false;
    }

    console.log('\n' + yellow('────────') + ' Proyecto inicializado ' + yellow('────────'));
    return true;
}
