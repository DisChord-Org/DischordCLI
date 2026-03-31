import axios from 'axios';
import apiConfig from './config';
import path from 'path';
import fs from 'fs';
import commander from './commander';

/**
 * Type representing the version strings for DisChord's core components.
 */
type Versions = Record<'compiler' | 'cli' | 'ide', string>;

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
     * @private
     */
    private static async get(endpoint: string) {
        try {
            const response = await axios.get(`${this.url}${endpoint}`);
            return response.data;
        } catch (error) {
            console.error(`Error en la solicitud GET a ${endpoint}:`, error);
        }
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

    /**
     * Downloads a specific component binary and saves it to the local filesystem.
     * Automatically handles directory creation and execution permissions for Unix systems.
     * @param component The component to download ('compiler' or 'cli').
     * @param version The target version string (e.g., '1.0.0').
     * @param outputPath The absolute local path where the binary should be saved.
     * @throws Error if the download fails or permission assignment fails.
     */
    static async downloadComponent(component: 'compiler' | 'cli', version: string, outputPath: string): Promise<void> {
        const finalPath = path.resolve(outputPath);

        try {
            const dir = path.dirname(finalPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const os =
                commander.isWindows? 'windows' :
                commander.isMacOS? 'macos' :
                'linux';

            const response = await axios({
                method: 'GET',
                url: `${this.url}/download/${component}/v${version}/${os}`,
                responseType: 'stream',
            });

            const writer = fs.createWriteStream(finalPath);

            return new Promise((resolve, reject) => {
                response.data.pipe(writer);
                let error: Error | null = null;
                
                writer.on('error', err => {
                    error = err;
                    writer.close();
                    reject(err);
                });

                writer.on('close', () => {
                    if (!error) resolve();

                    if (!commander.isWindows) {
                        try {
                            fs.chmodSync(finalPath, 0o755);
                        } catch (chmodError) {
                            return reject(new Error(`Error al dar permisos de ejecuión al binario: ${chmodError}`));
                        }
                    }
                });

                if (error) throw error;
            });
        } catch (error) {
            throw new Error(`Error al descargar el componente ${component}: ${error}`);
        }
    }
}

export default Requester;