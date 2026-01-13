import axios, { AxiosRequestConfig } from 'axios';
import { config } from '../config';

interface RobloxServer {
    id: string;
    maxPlayers: number;
    playing: number;
    playerIds: number[];
    fps: number;
    ping: number;
}

interface RobloxServerResponse {
    previousPageCursor: string | null;
    nextPageCursor: string | null;
    data: RobloxServer[];
}

export class RobloxService {
    private static instance: RobloxService;
    
    // Providers are defined as functions that take a subdomain and return the base URL
    private readonly providerGenerators = [
        (subdomain: string) => `https://${subdomain}.roblox.com`,
        (subdomain: string) => `https://${subdomain}.roproxy.com`,
        (subdomain: string) => `https://api.indovoice.id/${subdomain}`
    ];

    private constructor() {}

    public static getInstance(): RobloxService {
        if (!RobloxService.instance) {
            RobloxService.instance = new RobloxService();
        }
        return RobloxService.instance;
    }

    /**
     * Generic method to make requests to Roblox APIs with fallback support.
     * @param subdomain The subdomain of the API (e.g., 'games', 'users', 'thumbnails').
     * @param path The API path (e.g., '/v1/games/123/servers/Public').
     * @param config Optional Axios config.
     */
    public async request<T>(subdomain: string, path: string, config?: AxiosRequestConfig): Promise<T> {
        let lastError: any;

        for (const generateUrl of this.providerGenerators) {
            try {
                const baseUrl = generateUrl(subdomain);
                // Ensure path starts with /
                const normalizedPath = path.startsWith('/') ? path : `/${path}`;
                const url = `${baseUrl}${normalizedPath}`;
                
                console.log(`Attempting to fetch from: ${url}`);
                
                const response = await axios.get<T>(url, config);
                return response.data;
            } catch (error) {
                console.warn(`Failed to fetch from provider for ${subdomain}:`, error instanceof Error ? error.message : error);
                lastError = error;
                // Continue to the next provider
            }
        }

        console.error(`All providers failed for ${subdomain} request.`);
        throw new Error(`Failed to fetch data from all available providers for subdomain: ${subdomain}`);
    }

    public async getActiveServers(placeId: string, limit: number = 100): Promise<RobloxServer[]> {
        const response = await this.request<RobloxServerResponse>(
            'games',
            `/v1/games/${placeId}/servers/Public`,
            {
                params: {
                    sortOrder: 'Asc',
                    limit: limit
                }
            }
        );
        return response.data;
    }

    public async getUniverseId(placeId: string): Promise<number> {
        const response = await this.request<any>(
            'games',
            `/v1/games/multiget-place-details`,
            {
                params: {
                    placeIds: placeId
                }
            }
        );
        
        if (response && response.length > 0) {
            return response[0].universeId;
        }
        throw new Error('Universe ID not found for the given Place ID.');
    }

    public async publishMessage(universeId: number, topic: string, message: string | object): Promise<void> {
        const url = `https://apis.roblox.com/cloud/v2/universes/${universeId}:publishMessage`;
        const messageString = typeof message === 'string' ? message : JSON.stringify(message);

        try {
            await axios.post(
                url,
                {
                    topic: topic,
                    message: messageString
                },
                {
                    headers: {
                        'x-api-key': config.robloxApiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('Error publishing to Roblox Messaging Service:', error instanceof Error ? error.message : error);
            throw new Error('Failed to publish message.');
        }
    }
}

export const robloxService = RobloxService.getInstance();