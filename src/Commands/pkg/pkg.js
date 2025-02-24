const axios = require("axios");
const { readdirSync, createWriteStream, existsSync, mkdirSync, cpSync, rmdir, rmdirSync, cp, rmSync, readFileSync, statSync } = require("fs");
const path = require("path");
const { host, port } = require('../../../api.json');
const openpgp = require('openpgp');
const { createHash } = require("crypto");
const install = require("./install");

async function pkg(args) {
    switch (args[0]) {
        case 'install':
            install(args);
            break;

        case 'uninstall':
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