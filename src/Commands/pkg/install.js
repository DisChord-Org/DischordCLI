const axios = require("axios");
const { readdirSync, createWriteStream, existsSync, mkdirSync, cpSync, rmdir, rmdirSync, cp, rmSync, readFileSync, statSync, rm } = require("fs");
const path = require("path");
const { host, port } = require('../../../api.json');
const openpgp = require('openpgp');
const { createHash } = require("crypto");
const progressBar = require("../../Utils/progressBar");
const readline = require('readline');
const { execSync } = require("child_process");

async function install (args) {
    if (!args[1]) return console.log('Se debe especificar el nombre del paquete a instalar.');

    try {
        const find = await axios.get(`http://${host}:${port}/dependencies/find/${args[1]}`);

        if (find.data.error) return console.log(find.data.error);
        if (args[2] && !find.data.versions.includes(args[2].slice(1))) return console.log(`La versión ${args[2]} no existe.`);

        switch (find.data.type) {
            case 'official':
                downloadTrust(args, find);
                break;
            case 'trust':
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                await rl.question(`El paquete '${args[1]}' se descargará desde desde GitHub, lo que implica un riesgo de seguridad.\nSi el repositorio ha sido comprometido, podría contener código malicioso.\n¿Confía en el paquete '${args[1]}'? (S/N): `, (response) => {
                    rl.close();
                    if(response.toLowerCase() !== 's') return;
                    downloadTrust(args, find);
                });
                break;
            case 'unknown':
                download(args, find);
                break;
        }
    } catch (error) {
        console.log(`La dependencia '${args[1]}' no existe.`);
    }
    return;
}

async function download (args, find) {
    const response = await axios.get(
        args[2]?.startsWith('v')
            ? `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${args[2].slice(1)}`
            : `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${find.data.actualVersion}`
    );
    const files = response.data.files;
    const baseDir = `./dependencies/${args[1]}`;
    const configBar = {
        step: 1,
        totalSteps: files.length + 5
    };

    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });

    progressBar(configBar.step++, configBar.totalSteps, 'Comenzando descarga de archivos...')

    async function downloadFiles(files) {
        for (const item of files) {
            const relativePath = path.relative(find.data.path, item.url);
            const destinationPath = path.join(baseDir, relativePath);

            if (item.type === 'folder') {
                if (!existsSync(destinationPath)) {
                    mkdirSync(destinationPath, { recursive: true });
                    progressBar(configBar.step++, configBar.totalSteps, `Carpeta ${item.name} creada...`);
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

                progressBar(configBar.step++, configBar.totalSteps, `Fichero ${item.name} descargado...`);
            }
        }
    }

    await downloadFiles(files, baseDir);

    progressBar(configBar.step++, configBar.totalSteps, `Clonando dependencia...`);

    cp(path.join(__dirname, `../../../dependencies/${args[1]}/${args[2] && args[2].startsWith('v')? args[2].slice(1) : find.data.actualVersion}`), path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, async (error) => {
        if (error) return console.log(error);
        rmSync(path.join(__dirname, `../../../dependencies/${args[1]}/${args[2] && args[2].startsWith('v')? args[2].slice(1) : find.data.actualVersion}`), { recursive: true });

        progressBar(configBar.step++, configBar.totalSteps, `Verificando firma y hash...`);

        const publicKeyArmored = readFileSync(path.join(__dirname, `../../../public.pem`), 'utf8');
        const signature = readFileSync(path.join(__dirname, `../../../dependencies/${args[1]}/signature`), 'utf8');
        const storedHash = readFileSync(path.join(__dirname, `../../../dependencies/${args[1]}/hash`), 'utf8');
        const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
        const verified = await openpgp.verify({
            message: await openpgp.createMessage({ text: storedHash }),
            signature: await openpgp.readSignature({ armoredSignature: signature }),
            verificationKeys: publicKey,
        });

        const { signatures } = verified;
        const isValid = signatures[0].verified;

        if (!isValid) {
            rm(path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, (error) => {
                if (error) return console.log(error);
                return console.log("La firma no es válida. El código podría haber sido alterado (¡¡Man In The Middle!!).");
            });
        }

        const hashes = {};

        function generateHashes(route) {
            const src = readdirSync(route);

            for (const file of src) {
                if (file === '.git') continue;

                const newRoute = path.join(route, file);

                if (statSync(newRoute).isDirectory()) generateHashes(newRoute);
                else {
                    const content = readFileSync(newRoute);
                    const hash = createHash('sha256').update(content).digest('hex');
                    hashes[file] = hash;
                }
            }
        }

        progressBar(configBar.step++, configBar.totalSteps, `Generando hash...`);
        generateHashes(path.join(__dirname, `../../../dependencies/${args[1]}/src/`));

        const newHash = Object.entries(hashes).map(([nombre, hash]) => `${hash}  ${nombre}`).join('\n');

        if (newHash !== storedHash) {
            rm(path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, (error) => {
                if (error) return console.log(error);
                return console.log("El código ha sido alterado. La instalación se ha bloqueado (¡¡Posible Man In The Middle!!).");
            });
        }

        progressBar(configBar.step++, configBar.totalSteps, `Firma y hash verificados...`);
    });
}

async function downloadTrust (args, find) {
    const response = await axios.get(
        args[2]?.startsWith('v')
            ? `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${args[2].slice(1)}`
            : `http://${host}:${port}/dependencies/${find.data.type}/${args[1]}/${find.data.actualVersion}`
    );
    const files = response.data.files;
    const baseDir = `./dependencies/${args[1]}`;
    const configBar = {
        step: 1,
        totalSteps: files.length + 5
    };

    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });

    progressBar(configBar.step++, configBar.totalSteps, 'Comenzando descarga de archivos...')

    async function downloadFiles(files) {
        for (const item of files) {
            const relativePath = path.relative(find.data.path, item.url);
            const destinationPath = path.join(baseDir, relativePath);

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

            progressBar(configBar.step++, configBar.totalSteps, `Fichero ${item.name} descargado...`);
        }
    }

    await downloadFiles(files, baseDir);

    const version = args[2] && args[2].startsWith('v')? args[2].slice(1) : find.data.actualVersion;
    const repository = readFileSync(path.join(baseDir, version, 'repo'), 'utf8');
    const [, owner, repo] = new URL(repository).pathname.split('/');
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    execSync(`git clone --branch ${version} --depth 1 ${repoUrl} ${baseDir}/${version}/src`, {
        stdio: 'inherit'
    });

    progressBar(configBar.step++, configBar.totalSteps, `Clonando dependencia...`);

    cp(path.join(__dirname, `../../../dependencies/${args[1]}/${version}`), path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, async (error) => {
        if (error) return console.log(error);
        rmSync(path.join(__dirname, `../../../dependencies/${args[1]}/${version}`), { recursive: true });

        progressBar(configBar.step++, configBar.totalSteps, `Verificando firma y hash...`);

        const publicKeyArmored = readFileSync(path.join(__dirname, `../../../public.pem`), 'utf8');
        const signature = readFileSync(path.join(__dirname, `../../../dependencies/${args[1]}/signature`), 'utf8');
        const storedHash = readFileSync(path.join(__dirname, `../../../dependencies/${args[1]}/hash`), 'utf8');
        const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
        const verified = await openpgp.verify({
            message: await openpgp.createMessage({ text: storedHash }),
            signature: await openpgp.readSignature({ armoredSignature: signature }),
            verificationKeys: publicKey,
        });

        const { signatures } = verified;
        const isValid = signatures[0].verified;

        if (!isValid) {
            rm(path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, (error) => {
                if (error) return console.log(error);
                return console.log("La firma no es válida. El código podría haber sido alterado (¡¡Man In The Middle!!).");
            });
        }

        const hashes = {};

        function generateHashes(route) {
            const src = readdirSync(route);

            for (const file of src) {
                if (file === '.git') continue;

                const newRoute = path.join(route, file);

                if (statSync(newRoute).isDirectory()) generateHashes(newRoute);
                else {
                    const content = readFileSync(newRoute);
                    const hash = createHash('sha256').update(content).digest('hex');
                    hashes[file] = hash;
                }
            }
        }

        progressBar(configBar.step++, configBar.totalSteps, `Generando hash...`);
        generateHashes(path.join(__dirname, `../../../dependencies/${args[1]}/src/`));

        const newHash = Object.entries(hashes).map(([nombre, hash]) => `${hash}  ${nombre}`).join('\n');
        
        if (newHash !== storedHash) {
            rm(path.join(__dirname, `../../../dependencies/${args[1]}/`), { recursive: true }, (error) => {
                if (error) return console.log(error);
                return console.log("El código ha sido alterado. La instalación se ha bloqueado (¡¡Posible Man In The Middle!!).");
            });
        }

        progressBar(configBar.step++, configBar.totalSteps, `Firma y hash verificados...`);
    });
}

module.exports = install;