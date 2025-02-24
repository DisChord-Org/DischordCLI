const { readdirSync } = require("fs");
const path = require("path");
const install = require("./install");
const uninstall = require("./uninstall");

async function pkg(args) {
    switch (args[0]) {
        case 'install':
            install(args);
            break;

        case 'uninstall':
            uninstall(args);
            break;

        case 'list':
            let packages = readdirSync(path.join(__dirname, '../../../dependencies'));
            if (packages.length === 0) return;
            console.log('Paquetes instalados: ' + packages.map(pkg => pkg).join(', '));
            break;

        default:
            throw new Error(`${args[0]} no es un argumento válido.`);
    }
}

module.exports = pkg;