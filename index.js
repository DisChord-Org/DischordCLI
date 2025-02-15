#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const version = fs.readFileSync(path.join(__dirname, './version'));
const args = process.argv.slice(3);

function progressBar(step, totalSteps, message) {
  const width = 100;
  const percentage = Math.round((step / totalSteps) * 100);
  const equalsCount = Math.round((percentage / 100) * width);
  const dashCount = width - equalsCount;

  (async () => {
    const chalk = await import('chalk');

    const bar = `[${chalk.default.bgGreen('='.repeat(equalsCount))}${'-'.repeat(dashCount)}] ${percentage}%`;
    
    console.log(`${message.padEnd(40)} ${bar}`);
  })();
}

program.name('dc').description('DisChord CLI').version(`DisChord CLI v${version}`);

program.command('version').addArgument('update').description('Gestión de versión de DisChord').action(() => {
  if (args.length === 0) {
    console.log(`DisChord CLI v${version}`);
  } else if (args[0] === 'update') {
    let totalSteps = 12;

    progressBar(1, totalSteps, 'Comprobando disposición de git...'); // Barra de progreso.
    exec('git help', (m) => { if (m) return console.log('Debe instalar git CLI.'); });

    progressBar(2, totalSteps, 'Borrando carpeta dist...'); // Barra de progreso.
    if (fs.existsSync(path.join(__dirname, './dist/'))) fs.rmSync(path.join(__dirname, './dist/'), { recursive: true });

    progressBar(3, totalSteps, 'Borrando carpeta DisChord...'); // Barra de progreso.
    if (fs.existsSync(path.join(__dirname, './DisChord/'))) fs.rmSync(path.join(__dirname, './DisChord/'), { recursive: true });

    progressBar(4, totalSteps, 'Clonando respositorio desde github...'); // Barra de progreso.
    exec('git clone https://github.com/DisChord-Org/DisChord', (m1) => {
      if (m1) return console.log('Debe instalar git CLI.');

      progressBar(5, totalSteps, 'Instalando dependencias...'); // Barra de progreso.
      const dependencies = require(path.join(__dirname, './DisChord/package.json')).dependencies;
      exec('npm install ' + Object.keys(dependencies).join(' ') + ' typescript', (m2) => {
        if (m2) return console.log('Hubo un error al instalar las dependencias.');

        progressBar(6, totalSteps, 'Transpilando a JS...'); // Barra de progreso.
        exec('npx tsc --project ' + path.join(__dirname, './DisChord/'), (m3) => {
          if (m3) return console.log('Hubo un error al instalar las dependencias.');

          progressBar(7, totalSteps, 'Copiando y pegando dist...'); // Barra de progreso.
          fs.cpSync(path.join(__dirname, './DisChord/dist'), path.join(__dirname, './dist/'), { recursive: true });

          progressBar(8, totalSteps, 'Obteniendo versión...'); // Barra de progreso.
          const version = require(path.join(__dirname, './DisChord/package.json')).version;

          progressBar(9, totalSteps, 'Actualizando version...'); // Barra de progreso.
          fs.writeFileSync(path.join(__dirname, './version'), version);

          progressBar(10, totalSteps, 'Borrando repositorio clonado...'); // Barra de progreso.
          if (fs.existsSync(path.join(__dirname, './DisChord/'))) fs.rmSync(path.join(__dirname, './DisChord/'), { recursive: true });

          progressBar(11, totalSteps, 'Creando carpeta de dependencias...'); // Barra de progreso.
          if (!fs.existsSync(path.join(__dirname, './dependencies/'))) fs.mkdirSync(path.join(__dirname, './dependencies/'), { recursive: true });

          progressBar(12, totalSteps, 'Limpiando...'); // Barra de progreso.
        });
      });
    });

    // hay que obtener las dependencias del repositorios y hacer un install
  } else {
    console.error('Comando desconocido para version.');
  }
});


if ((program.commands.filter(command => command._name === process.argv.slice(2)[0])).length == 0 && process.argv.slice(2).length > 0 && fs.existsSync(path.join(__dirname, process.argv.slice(2).join('\\')))) {
  const Interpreter = require('./dist/main');
  new Interpreter.DisChord(fs.readFileSync(path.join(__dirname, process.argv.slice(2).join('\\')), { encoding: 'utf-8' }));
  return;
} else if (process.argv.slice(2).length == 0) {
  console.log('DisChord REPL v1.0.0');
  console.log('Escribe código y presiona Enter para ejecutarlo.');
  console.log('Escribe "exit" para salir.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    if (line.trim() === 'exit') {
      process.exit(0);
    }

    try {
      const Interpreter = require('./dist/main');
      new Interpreter.DisChord(line);
    } catch (error) {
      console.error('Error:', error.message);
    }

    rl.prompt();
  });
} else program.parse(process.argv);
