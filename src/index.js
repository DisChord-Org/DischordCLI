#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const version = fs.readFileSync(path.join(__dirname, './version'));
const args = process.argv.slice(3);
const commands = require('./Commands/index');

program.name('dc').description('DisChord CLI').version(`DisChord CLI v${version}`);

program.command('version').addArgument('update').description('Gestión de versión de DisChord').action(() => {
  commands.version(args);
});


if ((program.commands.filter(command => command._name === process.argv.slice(2)[0])).length == 0 && process.argv.slice(2).length > 0 && fs.existsSync(path.join(__dirname, process.argv.slice(2).join('\\')))) {
  const Interpreter = require('../dist/main');
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
      const Interpreter = require('../dist/main');
      new Interpreter.DisChord(line);
    } catch (error) {
      console.error('Error:', error.message);
    }

    rl.prompt();
  });
} else program.parse(process.argv);
