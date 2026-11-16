import type { DownloadProgress, DownloadProgressHandler } from './requester';

/**
 * Shared NDJSON (newline-delimited JSON) reporting primitives.
 *
 * Every DisChord CLI command that supports a --json flag ('chord update',
 * 'chord pkg install', ...) writes one JSON object per line to stdout so
 * external integrations (ej. DisChord Code Studio) can track progress.
 * Each command still owns its own event shape and phase names - this module
 * only centralizes the serialization and progress-throttling mechanics.
 *
 * The wire format emitted by any existing caller must not change as a
 * result of using these helpers, since integrations already parse it.
 */

/**
 * Serializes an event as a single line of JSON and writes it to stdout.
 * @template T - The shape of the event being emitted.
 * @param {T} event - The event to serialize and emit.
 * @returns {void}
 */
export function emitJson<T> (event: T): void {
    process.stdout.write(JSON.stringify(event) + '\n');
}

/**
 * Builds a download progress callback (compatible with Requester.downloadFile's
 * onProgress parameter) that emits an NDJSON event only when the rounded
 * download percentage changes, avoiding a flood of near-duplicate events.
 * @template T - The shape of the progress event being emitted.
 * @param {(percent: number, progress: DownloadProgress) => T} buildEvent - Builds
 * the event payload for a given progress snapshot.
 * @returns {DownloadProgressHandler} A throttled progress callback.
 */
export function createThrottledProgressEmitter<T> (
    buildEvent: (percent: number, progress: DownloadProgress) => T
): DownloadProgressHandler {
    let lastEmittedPercent = -1;

    return (progress: DownloadProgress) => {
        const percent = progress.total > 0 ? (progress.transferred / progress.total) * 100 : 0;
        const roundedPercent = Math.floor(percent);

        if (roundedPercent !== lastEmittedPercent) {
            lastEmittedPercent = roundedPercent;
            emitJson(buildEvent(percent, progress));
        }
    };
}
