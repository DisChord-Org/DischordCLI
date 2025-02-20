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
                    args[2]?.startsWith('v')
                        ? `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${args[2].slice(1)}`
                        : `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${find.data.actualVersion}`
                );
                const files = response.data.files;

                const baseDir = `./dependencies/${args[1]}`;
                if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });

                async function downloadFiles(files, basePath) {
                    for (const item of files) {
                        const relativePath = path.relative(find.data.path, item.url);
                        const destinationPath = path.join(baseDir, relativePath);

                        if (item.type === 'folder') {
                            if (!existsSync(destinationPath)) {
                                mkdirSync(destinationPath, { recursive: true });
                                console.log(`Carpeta ${relativePath} creada.`);
                            }
                        } else {
                            const fileResponse = await axios({
                                method: 'post',
                                url: `http://${host}:${port}/download`,
                                data: {
                                    filePath: item.url
                                },
                                responseType: 'stream'
                            });

                            const dir = path.dirname(destinationPath);
                            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

                            const writer = createWriteStream(destinationPath);
                            fileResponse.data.pipe(writer);

                            console.log(`Fichero ${relativePath} descargado en ${destinationPath}`);
                        }
                    }
                }

                await downloadFiles(files, baseDir);

                console.log('Descarga completa');

            } catch (error) {
                console.error('Error:', error.message);
            }
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