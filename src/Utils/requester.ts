import axios from 'axios';
import apiConfig from '../../api.json';
import path from 'path';
import fs from 'fs';
import commander from './commander';

interface VersionInfo {
    version: string;
    critical: boolean;
}

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

    static async getVersion(release: 'compiler' | 'cli' | 'ide'): Promise<VersionInfo> {
        return await this.get(`/version/${release}`) as VersionInfo;
    }

    static async getAllVersions(): Promise<VersionInfo[]> {
        const request: { versions: VersionInfo[] } | undefined = await this.get('/version/all');

        if (!request) return [];
        return request.versions;
    }

    static async downloadComponent(
        component: 'compiler' | 'cli' | 'ide',
        version: string,
        outputPath: string
    ): Promise<void> {
        const finalPath = path.resolve(outputPath);

        try {
            const dir = path.dirname(finalPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const _os = commander.isWindows? 'windows' : 'linux';
            const response = await axios({
                method: 'GET',
                url: `${this.url}/download/${component}/${version}/${_os}`,
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
                });

                if (error) throw error;
            });
        } catch (error) {
            throw new Error(`Error al descargar el componente ${component}: ${error}`);
        }
    }
}

export default Requester;