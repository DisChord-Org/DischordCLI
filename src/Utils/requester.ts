import axios from 'axios';
import apiConfig from './config';
import path from 'path';
import fs from 'fs';
import commander from './commander';

type Versions = Record<'compiler' | 'cli' | 'ide', string>;

class Requester {
    static url: string = `${apiConfig.host}`;

    private static async get(endpoint: string) {
        try {
            const response = await axios.get(`${this.url}${endpoint}`);
            return response.data;
        } catch (error) {
            console.error(`Error en la solicitud GET a ${endpoint}:`, error);
        }
    }

    static async getVersions(): Promise<Versions> {
        const versions = await this.get(`/versions`) as Versions;
        
        const cleanVersions = Object.entries(versions).reduce((acc, [key, value]) => {
            acc[key as keyof Versions] = typeof value === 'string' ? value.replace(/^v/, '') : value;
            return acc;
        }, {} as Versions);

        return cleanVersions;
    }

    static async downloadComponent(
        component: 'compiler' | 'cli',
        version: string,
        outputPath: string
    ): Promise<void> {
        const finalPath = path.resolve(outputPath);

        try {
            const dir = path.dirname(finalPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const response = await axios({
                method: 'GET',
                url: `${this.url}/download/${component}/v${version}`,
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