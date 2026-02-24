import chalk from "chalk";

export function red(text: string) {
    return chalk.red(text);
}

export function yellow(text: string) {
    return chalk.yellowBright(text);
}

export function gray(text: string) {
    return chalk.gray(text);
}

export function green(text: string) {
    return chalk.greenBright(text);
}

export function italic(text: string) {
    return chalk.italic(text);
}