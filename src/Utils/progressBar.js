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

module.exports = progressBar;