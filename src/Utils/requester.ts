import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';

import apiConfig from './config';
import Commander from './commander';
import { errorMessage } from './output';
import { assertOfficialReleaseUrl, getAssetArch, getComponentAssetName, type BinaryComponent } from './releaseAssets';

/** Version strings of DisChord's core components, as published by the API. */
export type Versions = Record<'compiler' | 'cli' | 'ide', string>;

/** Snapshot of the progress of an active download. */
export interface DownloadProgress {
    /** Total size of the resource in bytes, or 0 when the server does not announce it. */
    total: number;
    /** Amount of data already downloaded, in bytes. */
    transferred: number;
}

/** Callback invoked every time a chunk of a download is received. */
export type DownloadProgressHandler = (progress: DownloadProgress) => void;

/** Facts about a file once it has been completely downloaded. */
export interface DownloadResult {
    /** Size of the downloaded file, in bytes. */
    bytes: number;
    /** Hex-encoded SHA-256 of the downloaded content. */
    sha256: string;
}

/** Answer of the API's checksum route for a component binary. */
interface ComponentChecksum {
    /** Name of the release asset the checksum belongs to. */
    file: string;
    /** Release tag the asset was published in. */
    tag: string;
    /** Hex-encoded SHA-256 published by GitHub for that asset. */
    sha256: string;
}

/**
 * Error thrown when the API answers with a non-2xx HTTP status.
 * @class HttpError
 * @extends Error
 */
export class HttpError extends Error {
    /** The HTTP status code of the response. */
    public readonly status: number;

    /**
     * @param {number} status - The HTTP status code of the response.
     * @param {string} statusText - The HTTP status text of the response.
     * @param {string} resource - The endpoint or URL that was requested.
     */
    constructor (status: number, statusText: string, resource: string) {
        super(`Error en la petición a ${resource}: HTTP ${status} ${statusText}`.trimEnd());
        this.name = 'HttpError';
        this.status = status;
    }
}

/**
 * Utility class responsible for handling network requests to the DisChord API.
 * It manages JSON requests, file downloads and component binary downloads.
 * @class Requester
 */
class Requester {
    /** The base URL for the DisChord API host. */
    static readonly url: string = apiConfig.host;

    /** Maximum time a JSON request may take before it is aborted, in milliseconds. */
    private static readonly REQUEST_TIMEOUT_MS = 30_000;
    /** Maximum time a download may go without receiving any data before it is aborted, in milliseconds. */
    private static readonly DOWNLOAD_STALL_TIMEOUT_MS = 60_000;
    /** Suffix of the temporary file a download is written to before being moved into place. */
    private static readonly PARTIAL_SUFFIX = '.part';

    /**
     * Performs a GET request against the API and parses the response as JSON.
     * @async
     * @template T
     * @param {string} endpoint - The API endpoint to hit, starting with '/'.
     * @throws {HttpError} If the server answers with a non-2xx status.
     * @throws {Error} If a network error or a timeout occurs.
     * @returns {Promise<T>} The response data parsed as JSON.
     */
    public static async get<T = never> (endpoint: string): Promise<T> {
        let response: Response;

        try {
            response = await fetch(`${Requester.url}${endpoint}`, { signal: AbortSignal.timeout(Requester.REQUEST_TIMEOUT_MS) });
        } catch (error) {
            throw new Error(`Error en la petición a ${endpoint}: ${errorMessage(error)}`);
        }

        if (!response.ok) throw new HttpError(response.status, response.statusText, endpoint);

        try {
            return (await response.json()) as T;
        } catch (error) {
            throw new Error(`Respuesta no válida de ${endpoint}: ${errorMessage(error)}`);
        }
    }

    /**
     * Fetches the latest available versions from the API.
     * Sanitizes version strings by removing the 'v' prefix if present.
     * @async
     * @throws {Error} If fetching versions fails.
     * @returns {Promise<Versions>} A promise that resolves to the cleaned versions object.
     */
    static async getVersions (): Promise<Versions> {
        const versions = await Requester.get<Versions>('/versions');

        return Object.entries(versions).reduce((acc, [key, value]) => {
            acc[key as keyof Versions] = typeof value === 'string' ? value.replace(/^v/, '') : value;
            return acc;
        }, {} as Versions);
    }

    /**
     * Downloads a file from a URL into the given path.
     *
     * The data is first written to a sibling '.part' file and only moved onto the final path
     * once the whole body has been received and its size matches the one announced by the
     * server, so the destination never holds a truncated file: it either keeps its previous
     * content or receives the complete download. The download is aborted if no data arrives
     * for {@link DOWNLOAD_STALL_TIMEOUT_MS}.
     * @async
     * @param {string} fullUrl - The complete URL of the file to download.
     * @param {string} outputPath - The local filesystem path where the file will be saved.
     * @param {DownloadProgressHandler} [onProgress] - Optional callback to track download progress.
     * @throws {Error} If the request fails, stalls, is incomplete, or the file cannot be written.
     * @returns {Promise<DownloadResult>} The size and SHA-256 of the downloaded file.
     */
    static async downloadFile (fullUrl: string, outputPath: string, onProgress?: DownloadProgressHandler): Promise<DownloadResult> {
        const finalPath = path.resolve(outputPath);
        const partialPath = `${finalPath}${Requester.PARTIAL_SUFFIX}`;

        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        const controller = new AbortController();
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const armStallTimer = (): void => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => controller.abort(new Error('la descarga dejó de recibir datos')), Requester.DOWNLOAD_STALL_TIMEOUT_MS);
        };

        let file: fs.promises.FileHandle | undefined;

        try {
            armStallTimer();
            const response = await fetch(fullUrl, { signal: controller.signal });

            if (!response.ok || !response.body) throw new HttpError(response.status, response.statusText, fullUrl);

            /**
             * 'content-length' describes the bytes on the wire. When the body is compressed in
             * transit, fetch hands over the decompressed bytes, so both sizes legitimately differ
             * and the completeness check below can only be applied to uncompressed responses.
             */
            const encoding = response.headers.get('content-encoding');
            const isCompressed = !!encoding && encoding.toLowerCase() !== 'identity';
            const totalLength = isCompressed ? 0 : parseInt(response.headers.get('content-length') ?? '0', 10) || 0;

            const reader = response.body.getReader();
            const hash = createHash('sha256');
            let transferred = 0;

            file = await fs.promises.open(partialPath, 'w');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                armStallTimer();
                await file.write(value);
                hash.update(value);

                transferred += value.length;
                if (onProgress) onProgress({ total: totalLength, transferred });
            }

            await file.close();
            file = undefined;

            if (transferred === 0) throw new Error('el servidor devolvió un fichero vacío');
            if (totalLength > 0 && transferred !== totalLength) {
                throw new Error(`descarga incompleta (${transferred} de ${totalLength} bytes)`);
            }

            fs.renameSync(partialPath, finalPath);

            return { bytes: transferred, sha256: hash.digest('hex') };
        } catch (error) {
            if (file) await file.close().catch(() => undefined);
            fs.rmSync(partialPath, { force: true });

            throw new Error(`Fallo en la descarga: ${errorMessage(error)}`);
        } finally {
            clearTimeout(stallTimer);
        }
    }

    /**
     * Builds the API endpoint a component binary is requested from.
     * @param {BinaryComponent} component - The component.
     * @param {string} version - The target version string, without the 'v' prefix.
     * @returns {string} The endpoint path, starting with '/'.
     * @private
     */
    private static componentEndpoint (component: BinaryComponent, version: string): string {
        return `/download/${component}/v${encodeURIComponent(version)}/${Commander.platform}`;
    }

    /**
     * Asks the API where a component binary is, without following the redirect, and checks
     * that the answer is the official GitHub release asset for this platform.
     * @async
     * @param {BinaryComponent} component - The component to locate.
     * @param {string} version - The target version string, without the 'v' prefix.
     * @param {string} assetName - The asset file name expected for this platform.
     * @throws {HttpError} If the API does not answer with a redirect.
     * @throws {UntrustedDownloadError} If the redirect does not point to the official release asset.
     * @returns {Promise<string>} The validated URL to download the binary from.
     * @private
     */
    private static async resolveComponentUrl (component: BinaryComponent, version: string, assetName: string): Promise<string> {
        const endpoint = `${Requester.componentEndpoint(component, version)}?arch=${getAssetArch()}`;
        const response = await fetch(`${Requester.url}${endpoint}`, { redirect: 'manual', signal: AbortSignal.timeout(Requester.REQUEST_TIMEOUT_MS) });
        const location = response.headers.get('location');

        if (response.status < 300 || response.status >= 400 || !location) throw new HttpError(response.status, response.statusText, endpoint);

        return assertOfficialReleaseUrl(location, component, version, assetName);
    }

    /**
     * Fetches the SHA-256 GitHub published for a component binary, through the API.
     * @async
     * @param {BinaryComponent} component - The component.
     * @param {string} version - The target version string, without the 'v' prefix.
     * @param {string} assetName - The asset file name the checksum must belong to.
     * @returns {Promise<string | undefined>} The lowercase hex digest, or undefined when the API
     * has no checksum for that asset or cannot be reached.
     * @private
     */
    private static async fetchComponentChecksum (component: BinaryComponent, version: string, assetName: string): Promise<string | undefined> {
        try {
            const checksum = await Requester.get<ComponentChecksum>(`${Requester.componentEndpoint(component, version)}/checksum?arch=${getAssetArch()}`);

            if (checksum?.file !== assetName || typeof checksum.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(checksum.sha256)) return undefined;

            return checksum.sha256.toLowerCase();
        } catch {
            return undefined;
        }
    }

    /**
     * Downloads a specific DisChord component binary tailored for the current operating system
     * and architecture, and assigns execution permissions (0o755) on Unix-based systems.
     *
     * The API only tells where the binary is: the download itself is pinned to the official
     * GitHub release of the component for the requested version (see
     * {@link assertOfficialReleaseUrl}), so a tampered API answer cannot make the CLI install
     * a binary from anywhere else. The downloaded file is then compared against the SHA-256
     * GitHub published for it; a mismatch aborts, while a missing checksum only skips this
     * integrity check, since the origin of the file is already guaranteed.
     * @async
     * @param {BinaryComponent} component - The name of the component to download.
     * @param {string} version - The target version string, without the 'v' prefix.
     * @param {string} outputPath - The absolute local path where the binary should be saved.
     * @param {DownloadProgressHandler} [onProgress] - Optional callback to track the download progress.
     * @throws {Error} If the binary is not served from its official release, the download fails,
     * its checksum does not match, or execution permissions cannot be set.
     * @returns {Promise<boolean>} True if the checksum was verified, false if none was available.
     */
    static async downloadComponent (
        component: BinaryComponent,
        version: string,
        outputPath: string,
        onProgress?: DownloadProgressHandler
    ): Promise<boolean> {
        try {
            const assetName = getComponentAssetName(component, Commander.platform, getAssetArch());
            const downloadUrl = await Requester.resolveComponentUrl(component, version, assetName);
            const expectedSha256 = await Requester.fetchComponentChecksum(component, version, assetName);

            const { sha256 } = await Requester.downloadFile(downloadUrl, outputPath, onProgress);

            if (expectedSha256 && sha256 !== expectedSha256) {
                fs.rmSync(outputPath, { force: true });
                throw new Error(`el fichero descargado no coincide con el checksum publicado (esperado ${expectedSha256}, obtenido ${sha256})`);
            }

            if (!Commander.isWindows) fs.chmodSync(outputPath, 0o755);

            return expectedSha256 !== undefined;
        } catch (error) {
            throw new Error(`Error al procesar componente ${component}: ${errorMessage(error)}`);
        }
    }
}

export default Requester;
