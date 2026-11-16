import semver from 'semver';
import boxen from 'boxen';
import cliProgress from 'cli-progress';

import { cyan, gray, yellow } from './drawer';
import type { DownloadProgressHandler } from './requester';

/** Number of bytes in a megabyte, the unit shown by the download progress bar. */
const BYTES_PER_MEGABYTE = 1024 * 1024;
/** Width of the progress bar when the terminal width is unknown (ej. output is piped). */
const DEFAULT_BAR_SIZE = 30;
/** Share of the terminal width taken by the progress bar. */
const BAR_WIDTH_RATIO = 0.4;

/** A download progress bar together with the callback that feeds it. */
export interface DownloadProgressBar {
    /** The underlying bar; call 'stop()' on it once the download ends, successfully or not. */
    bar: cliProgress.SingleBar;
    /** Progress callback to hand to Requester.downloadFile / Requester.downloadComponent. */
    handleProgress: DownloadProgressHandler;
}

/**
 * Compares two version strings to determine if an update is required.
 * An installed version that cannot be parsed is treated as outdated.
 * @param {string} current - The version currently installed in the system.
 * @param {string} latest - The latest version available in the remote repository.
 * @throws {TypeError} If the latest version is not a valid semantic version.
 * @returns {'up-to-date' | 'update-available'} The status of the version comparison.
 */
export function updateAvailable (current: string, latest: string): 'up-to-date' | 'update-available' {
    if (!semver.valid(current)) return 'update-available';

    return semver.gte(current, latest) ? 'up-to-date' : 'update-available';
}

/**
 * Prints a boxed notification for a new version release.
 * @param {string} version - The new version string, without the 'v' prefix.
 * @param {boolean} [verbose] - Whether to also print the command that installs the update.
 * @returns {void}
 */
export function printNewVersionAvailableMessage (version: string, verbose: boolean = false): void {
    const hint = verbose ? `\n${yellow('Ejecuta')} ${cyan('chord update all')} ${yellow('para actualizar.')}` : '';

    console.log(createBox(`Nueva versión disponible: ${gray('v' + version)}${hint}`));
}

/**
 * Wraps a message string inside a styled CLI box using the boxen library.
 * @param {string} message - The text content to be displayed in the box.
 * @returns {string} The formatted string with borders and padding.
 */
export function createBox (message: string): string {
    return boxen(message, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        dimBorder: false,
        textAlignment: 'center'
    });
}

/**
 * Creates a terminal progress bar for a download, expressed in megabytes.
 * The bar starts on the first progress report, so nothing is drawn if the download fails
 * before receiving any data.
 * @param {string} resourceName - The name of what is being downloaded, shown next to the bar.
 * @returns {DownloadProgressBar} The bar and the progress callback that updates it.
 */
export function createDownloadProgressBar (resourceName: string): DownloadProgressBar {
    const columns = process.stdout.columns;

    const bar = new cliProgress.SingleBar({
        format: `${gray('Descargando')} ${cyan(resourceName)} |` + '{bar}' + '| {percentage}% | {value}/{total} MB',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        stopOnComplete: true,
        barsize: columns ? Math.floor(columns * BAR_WIDTH_RATIO) : DEFAULT_BAR_SIZE
    }, cliProgress.Presets.shades_classic);

    const toMegabytes = (bytes: number): number => Number((bytes / BYTES_PER_MEGABYTE).toFixed(2));
    let started = false;

    const handleProgress: DownloadProgressHandler = (progress) => {
        // without an announced size the bar grows with the download instead of dividing by zero.
        const total = toMegabytes(progress.total > 0 ? progress.total : progress.transferred);

        if (!started) {
            bar.start(total, 0);
            started = true;
        } else if (progress.total <= 0) {
            bar.setTotal(total);
        }

        bar.update(toMegabytes(progress.transferred));
    };

    return { bar, handleProgress };
}
