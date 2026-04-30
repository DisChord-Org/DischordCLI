import chalk from "chalk";

/**
 * Utility function to wrap text in red color for terminal output.
 * @param text The string to be colored.
 * @returns The formatted string with red ANSI codes.
 */
export function red(text: string) {
    return chalk.red(text);
}

/**
 * Utility function to wrap text in bright yellow color for terminal output.
 * @param text The string to be colored.
 * @returns The formatted string with bright yellow ANSI codes.
 */
export function yellow(text: string) {
    return chalk.yellowBright(text);
}

/**
 * Utility function to wrap text in gray color for terminal output.
 * @param text The string to be colored.
 * @returns The formatted string with gray ANSI codes.
 */
export function gray(text: string) {
    return chalk.gray(text);
}

/**
 * Utility function to wrap text in bright green color for terminal output.
 * @param text The string to be colored.
 * @returns The formatted string with bright green ANSI codes.
 */
export function green(text: string) {
    return chalk.greenBright(text);
}

/**
 * Utility function to wrap text in cyan color for terminal output.
 * @param text The string to be colored.
 * @returns The formatted string with bright green ANSI codes.
 */
export function cyan (text: string) {
    return chalk.cyan(text);
}

/**
 * Utility function to apply italic formatting to text for terminal output.
 * @param text The string to be formatted.
 * @returns The formatted string with italic ANSI codes.
 */
export function italic(text: string) {
    return chalk.italic(text);
}

/**
 * Utility function to apply bold formatting to text for terminal output.
 * @param text The string to be formatted.
 * @returns The formatted string with bold ANSI codes.
 */
export function bold (text: string) {
    return chalk.bold(text);
}