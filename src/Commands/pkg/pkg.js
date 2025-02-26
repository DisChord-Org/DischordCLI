const { readdirSync, readFileSync } = require("fs");
const path = require("path");
const install = require("./install");
const uninstall = require("./uninstall");

async function pkg(args) {
    if (args.length == 0) args[0] = 'list';

    switch (args[0]) {
        case 'install':
            if (!args[1]) console.log('Por favor, especifique un paquete para instalar.');
            install(args);
            break;

        case 'uninstall':
            if (!args[1]) console.log('Por favor, especifique un paquete para desinstalar.');
            uninstall(args);
            break;

        case 'list':
            let packages = readdirSync(path.join(__dirname, '../../../dependencies'));
            if (packages.length === 0) return;
            console.log(packages.map(pkg =>
                `${pkg} - ${readFileSync(path.join(__dirname, '../../../dependencies', pkg, 'version'))}. By ${JSON.parse(readFileSync(path.join(__dirname, '../../../dependencies', pkg, 'author.json'))).username}`
            ).join('\n'));
            break;

        default:
            throw new Error(`${args[0]} no es un argumento válido.`);
    }
}

module.exports = pkg;