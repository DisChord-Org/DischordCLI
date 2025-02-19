const axios = require("axios");
const { readdirSync, writeFileSync } = require("fs");
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

                const response = axios.get(
                    args[2]?.startWith('v')
                    ? `http://${host}:${port}/dependencies/${args[1]}/${args[2].slice(1)}`
                    : `http://${host}:${port}/dependencies/${args[1]}`
                );
                const files = response.data.files;

                for (const file of files) {
                    const fileResponse = await axios.get(file.url, { responseType: 'stream' });
                    const writer = createWriteStream(`./dependencies/${args[1]}/${file.name}`);
                    fileResponse.data.pipe(writer);
                }

                console.log('Descarga completa');

            } catch (error) {
                console.log(error.message)
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