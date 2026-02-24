import axios from 'axios';
import apiConfig from '../../api.json';

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

    static async getVersion(release: 'compiler' | 'cli' | 'ide') {
        return await this.get(`/version/${release}`);
    }
}

export default Requester;