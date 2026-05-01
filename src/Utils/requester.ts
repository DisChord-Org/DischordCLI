import axios, { AxiosResponse } from 'axios';
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
 */
class Requester {
    /** The base URL for the DisChord API host. */
    static url: string = `${apiConfig.host}`;

    /**
     * Internal helper to perform GET requests.
     * @param endpoint The API endpoint to hit.
     * @returns The response data or undefined if an error occurs.
     */
    public static async get(endpoint: string): Promise<any> {
        const response = await axios.get(`${this.url}${endpoint}`).catch(() => {
            return undefined;
        });
        
        return response?.data;
    }

    /**
     * Fetches the latest available versions from the API.
     * Sanitizes version strings by removing the 'v' prefix if present.
     * @returns {Promise<Versions>} A promise that resolves to the cleaned versions object.
     */
    static async getVersions(): Promise<Versions> {
        const versions = await this.get(`/versions`) as Versions;
        
        const cleanVersions = Object.entries(versions).reduce((acc, [key, value]) => {
            acc[key as keyof Versions] = typeof value === 'string' ? value.replace(/^v/, '') : value;
            return acc;
        }, {} as Versions);

        return cleanVersions;
    }

    static async downloadFile(
        fullUrl: string,
        outputPath: string,
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<void> {
        const finalPath = path.resolve(outputPath);
        const dir = path.dirname(finalPath);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        try {
            const response = await axios({
                method: 'GET',
                url: fullUrl,
                responseType: 'stream',
            });

            const totalLength = parseInt(response.headers['content-length'], 10) || 0;
            const writer = fs.createWriteStream(finalPath);
            let transferred = 0;

            return new Promise((resolve, reject) => {
                response.data.pipe(writer);

                response.data.on('data', (chunk: Buffer) => {
                    transferred += chunk.length;
                    if (onProgress) onProgress({ total: totalLength, transferred });
                });

                writer.on('error', err => {
                    writer.close();
                    reject(err);
                });

                writer.on('close', () => resolve());
            });
        } catch (error) {
            throw new Error(`Fallo en la descarga: ${error}`);
        }
    }

    /**
     * Downloads a specific component binary and saves it to the local filesystem.
     * Automatically handles directory creation and execution permissions for Unix systems.
     * @param component The component to download ('compiler' or 'cli').
     * @param version The target version string.
     * @param outputPath The absolute local path where the binary should be saved.
     * @throws Error if the download fails or permission assignment fails.
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