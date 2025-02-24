const { rmSync, existsSync } = require("fs");
const path = require("path");
const progressBar = require("../../Utils/progressBar");

async function uninstall(args) {
    if (!args[1]) return console.log('Se debe especificar el nombre del paquete a desinstalar.');

    const dependencyDir = path.join(__dirname, `../../../dependencies/${args[1]}`);
    const configBar = {
        step: 1,
        totalSteps: 2
    };

    if (!existsSync(dependencyDir)) {
        return console.log(`El paquete ${args[1]} no está instalado.`);
    }

    progressBar(configBar.step++, configBar.totalSteps, `Iniciando desinstalación de ${args[1]}...`);

    try {
        rmSync(dependencyDir, { recursive: true, force: true });
        progressBar(configBar.step++, configBar.totalSteps, `Eliminando archivos de ${args[1]}...`);
    } catch (error) {
        console.error(`Error al desinstalar el paquete ${args[1]}:`, error.message);
    }
}

module.exports = uninstall;