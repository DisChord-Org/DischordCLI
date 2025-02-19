const axios = require("axios");
const { readdirSync, createWriteStream, existsSync, mkdirSync } = require("fs");
const path = require("path");
const { host, port } = require('../../../api.json');

async function pkg(args) {

    switch (args[0]) {
        case 'install':
            if (!args[1]) return console.log('Se debe especificar el nombre del paquete a instalar.');

            try {
                const find = await axios.get(`http://${host}:${port}/dependencies/find/${args[1]}`);

                if (find.data.error) return console.log(find.data.error);

                if (args[2] && !find.data.versions.includes(args[2].slice(1))) return console.log(`La versión ${args[2]} no existe.`);
                console.log(find.data);

                const response = await axios.get(
                    args[2]?.startWith('v')
                    ? `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${args[2].slice(1)}`
                    : `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${find.data.actualVersion}`
                );
                const files = response.data.files;

                if (!existsSync(`./dependencies/${args[1]}`)) mkdirSync(`./dependencies/${args[1]}`);

                for (const file of files) {
                    const fileResponse = await axios.get(file.url, { responseType: 'stream' });
                    const writer = createWriteStream(`./dependencies/${args[1]}/${file.name}`);
                    console.log(`Fichero ${file.name} descargado en ${args[1]}`);
                    fileResponse.data.pipe(writer);
                }

                console.log('Descarga completa');

            } catch (error) {
                console.log(error)
                console.error('Dependencia no encontrada.');
            }
            break;
        case 'uninstall':
            break;
        case 'list':
            let packages = readdirSync(path.join(__dirname, '../../../dependencies'));
            if (packages.length === 0) return;
            console.log('Paquetes instalados: ' + packages.map(pkg => pkg).join(', '));
            break;
        default: throw new Error(`${args[0]} no es un argumento válido.`);
    }

}

module.exports = pkg;