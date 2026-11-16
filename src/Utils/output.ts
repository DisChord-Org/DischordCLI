/**
 * Shared helpers for reporting problems to the user.
 *
 * Diagnostics always go to stderr so stdout stays clean for the actual command output (which,
 * in --json mode, is a stream of NDJSON events parsed by integrations such as DisChord Code
 * Studio). Failures also set a non-zero exit code so scripts and CI can detect them.
 */

/** Exit code reported when a command does not complete successfully. */
export const FAILURE_EXIT_CODE = 1;

/**
 * Marks the current process as failed without terminating it, so pending work and cleanup
 * can still finish before the process exits with {@link FAILURE_EXIT_CODE}.
 * @returns {void}
 */
export function markFailed (): void {
    process.exitCode = FAILURE_EXIT_CODE;
}

/**
 * Prints an error message to stderr and marks the process as failed.
 * @param {string} message - The already-formatted message to print.
 * @returns {void}
 */
export function fail (message: string): void {
    console.error(message);
    markFailed();
}

/**
 * Prints a non-fatal diagnostic message to stderr.
 * @param {string} message - The already-formatted message to print.
 * @returns {void}
 */
export function warn (message: string): void {
    console.error(message);
}

/**
 * Extracts a printable message from anything that was thrown.
 * @param {unknown} error - The thrown value.
 * @returns {string} The error's own message, or its string representation.
 */
export function errorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
