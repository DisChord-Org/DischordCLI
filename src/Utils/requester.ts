import apiConfig from './config';
import path from 'path';
import fs from 'fs';
import commander from './commander';

/**
 * Type representing the version strings for DisChord's core components.
 */
type Versions = Record<'compiler' | 'cli' | 'ide', string>;

/**
 * Metadata for tracking the progress of an active download.
 * @property {number} total - Total size of the resource in bytes.
 * @property {number} transferred - Amount of data already downloaded in bytes.
 */
interface DownloadProgress {
    total: number;
    transferred: number;
}

/**
 * Utility class responsible for handling network requests to the DisChord API.
 * It manages component downloads, version checks, and filesystem synchronization.
 * @class Requester
 */
class Requester {
    /** The base URL for the DisChord API host. */
    static url: string = `${apiConfig.host}`;

    /**
     * Internal helper to perform GET requests using native fetch.
     * @async
     * @static
     * @template T
     * @param {string} endpoint - The API endpoint to hit.
     * @throws {Error} If the HTTP response is not ok or if a network error occurs.
     * @returns {Promise<T>} The response data parsed as JSON.
     */
    public static async get<T = never>(endpoint: string): Promise<T> {
        try {
            const response = await fetch(`${this.url}${endpoint}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            
            return (await response.json()) as T;
        } catch (error) {
            throw new Error(`Error en la petición a ${endpoint}: ${error}`);
        }
    }

    /**
     * Fetches the latest available versions from the API.
     * Sanitizes version strings by removing the 'v' prefix if present.
     * @async
     * @static
     * @throws {Error} If fetching versions fails.
     * @returns {Promise<Versions>} A promise that resolves to the cleaned versions object.
     */
    static async getVersions(): Promise<Versions> {
        const versions = await this.get<Versions>('/versions');

        const cleanVersions = Object.entries(versions).reduce((acc, [key, value]) => {
            acc[key as keyof Versions] = typeof value === 'string' ? value.replace(/^v/, '') : value;
            return acc;
        }, {} as Versions);

        return cleanVersions;
    }

    /**
     * Downloads a file from a URL and saves it to the specified output path using web stream readers.
     * Automatically creates the destination directory if it does not exist and manages write stream backpressure.
     * @async
     * @static
     * @param {string} fullUrl - The complete URL of the file to download.
     * @param {string} outputPath - The local filesystem path where the file will be saved.
     * @param {(progress: DownloadProgress) => void} [onProgress] - Optional callback to track download progress.
     * @throws {Error} If the network request fails, responds with non-2xx status, or encounters filesystem write errors.
     * @returns {Promise<void>}
     */
    static async downloadFile(
        fullUrl: string,
        outputPath: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<void> {
        const finalPath = path.resolve(outputPath);
        const dir = path.dirname(finalPath);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        try {
            const response = await fetch(fullUrl);

            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const totalLength = parseInt(response.headers.get('content-length') ?? '0', 10) || 0;
            const reader = response.body.getReader();
            const writer = fs.createWriteStream(finalPath);
            let transferred = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    transferred += value.length;
                    if (onProgress) onProgress({ total: totalLength, transferred });

                    const canWrite = writer.write(value);
                    if (!canWrite) {
                        await new Promise<void>((resolve) => writer.once('drain', resolve));
                    }
                }
            } finally {
                writer.end();
            }

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Fallo en la descarga: ${error}`);
        }
    }

    /**
     * Downloads a specific DisChord component binary tailored for the current operating system.
     * Automatically handles directory creation and assigns execution permissions (0o755) on Unix-based systems.
     * @async
     * @static
     * @param {'compiler' | 'cli'} component - The name of the component to download.
     * @param {string} version - The target version string.
     * @param {string} outputPath - The absolute local path where the binary should be saved.
     * @param {(progress: DownloadProgress) => void} [onProgress] - Optional callback to track the binary's download progress.
     * @throws {Error} If the download fails or if execution permissions cannot be set on Linux/MacOS.
     * @returns {Promise<void>}
     */
    static async downloadComponent(
        component: 'compiler' | 'cli',
        version: string,
        outputPath: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<void> {
        const os = commander.isWindows ? 'windows' : commander.isMacOS ? 'macos' : 'linux';
        const downloadUrl = `${this.url}/download/${component}/v${version}/${os}`;

        try {
            await this.downloadFile(downloadUrl, outputPath, onProgress);

            if (!commander.isWindows) {
                try {
                    fs.chmodSync(outputPath, 0o755);
                } catch (chmodError) {
                    throw new Error(`Error al dar permisos de ejecución: ${chmodError}`);
                }
            }
        } catch (error) {
            throw new Error(`Error al procesar componente ${component}: ${error}`);
        }
    }
}

export default Requester;