import axios, { AxiosRequestConfig } from 'axios';
import { config } from '../config';
import { dbManager } from '../database';

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

export interface LuauExecutionTask {
    path: string;
    user: string;
    state: 'QUEUED' | 'PROCESSING' | 'CANCELLED' | 'COMPLETE' | 'FAILED';
    script: string;
    createTime: string;
    updateTime: string;
    output?: {
        results: any;
        print: string[];
    };
    error?: {
        code: string;
        message: string;
        details: any[];
    };
}

export interface LuauExecutionTaskLogs {
    luauExecutionSessionTaskLogs: {
        messages: string[];
    }[];
}

interface RobloxProvider {
    name: string;
    generateUrl: (subdomain: string) => string;
}

export class RobloxService {
    private static instance: RobloxService;
    
    // Providers with dynamic reordering
    private providers: RobloxProvider[] = [
        { name: 'Roblox', generateUrl: (subdomain: string) => `https://${subdomain}.roblox.com` },
        { name: 'RoProxy', generateUrl: (subdomain: string) => `https://${subdomain}.roproxy.com` },
        { name: 'IndoVoice', generateUrl: (subdomain: string) => `https://api.indovoice.id/${subdomain}` }
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

        // Iterate through a copy to handle concurrent modifications safely-ish, 
        // though strictly speaking in JS single-thread event loop, simple iteration is fine.
        // We use the live array index to facilitate reordering.
        for (let i = 0; i < this.providers.length; i++) {
            const provider = this.providers[i];
            try {
                const baseUrl = provider.generateUrl(subdomain);
                // Ensure path starts with /
                const normalizedPath = path.startsWith('/') ? path : `/${path}`;
                const url = `${baseUrl}${normalizedPath}`;
                
                console.log(`[${provider.name}] Attempting to fetch from: ${url}`);
                
                const response = await axios.get<T>(url, config);
                
                // If successful and not first, move to front
                if (i > 0) {
                    this.providers.splice(i, 1);
                    this.providers.unshift(provider);
                    console.log(`Provider priority updated: ${this.providers.map(p => p.name).join(' > ')}`);
                }

                return response.data;
            } catch (error) {
                if (axios.isAxiosError(error) && error.response) {
                    const headers = error.response.headers;
                    const remaining = headers['x-ratelimit-remaining'];
                    const reset = headers['x-ratelimit-reset'];

                    if (error.response.status === 429) {
                        throw new Error(`Rate limit exceeded for ${subdomain}. Resets in ${reset}s. (Remaining: ${remaining})`);
                    }
                }
                console.warn(`Failed to fetch from ${provider.name}:`, error instanceof Error ? error.message : error);
                lastError = error;
                // Continue to the next provider
            }
        }

        console.error(`All providers failed for ${subdomain} request.`);
        throw lastError || new Error(`Failed to fetch data from all available providers for subdomain: ${subdomain}`);
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
        // Check cache first
        try {
            const cachedUniverseId = await dbManager.getPlaceCache(placeId);
            if (cachedUniverseId) {
                return cachedUniverseId;
            }
        } catch (error) {
            console.error('Error fetching from PlaceCache:', error);
            // Proceed to fetch from API if cache fails
        }

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
            const universeId = response[0].universeId;
            // Cache the result
            try {
                await dbManager.setPlaceCache(placeId, universeId);
            } catch (error) {
                console.error('Error saving to PlaceCache:', error);
            }
            return universeId;
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
            if (axios.isAxiosError(error) && error.response) {
                const headers = error.response.headers;
                const remaining = headers['x-ratelimit-remaining'];
                const reset = headers['x-ratelimit-reset'];

                if (error.response.status === 429) {
                    throw new Error(`Rate limit exceeded. Resets in ${reset}s. (Remaining: ${remaining})`);
                }
            }
            console.error('Error publishing to Roblox Messaging Service:', error instanceof Error ? error.message : error);
            throw new Error('Failed to publish message.');
        }
    }

    public async createLuauExecutionTask(universeId: number, placeId: string, script: string, version?: number): Promise<LuauExecutionTask> {
        let url = `https://apis.roblox.com/cloud/v2/universes/${universeId}/places/${placeId}`;
        if (version) {
            url += `/versions/${version}`;
        }
        url += `/luau-execution-session-tasks`;

        try {
            const response = await axios.post<LuauExecutionTask>(
                url,
                { script },
                {
                    headers: {
                        'x-api-key': config.robloxApiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error creating Luau execution task:', error instanceof Error ? error.message : error);
            if (axios.isAxiosError(error) && error.response) {
                 throw new Error(`Failed to create task: ${error.response.data?.message || error.message}`);
            }
            throw new Error('Failed to create Luau execution task.');
        }
    }

    public async getLuauExecutionTask(taskPath: string): Promise<LuauExecutionTask> {
        const url = `https://apis.roblox.com/cloud/v2/${taskPath}`;
        try {
            const response = await axios.get<LuauExecutionTask>(
                url,
                {
                    headers: { 'x-api-key': config.robloxApiKey }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error fetching Luau execution task:', error instanceof Error ? error.message : error);
            throw new Error('Failed to fetch Luau execution task status.');
        }
    }

    public async getLuauExecutionTaskLogs(taskPath: string): Promise<string> {
        const url = `https://apis.roblox.com/cloud/v2/${taskPath}/logs`;
        try {
            const response = await axios.get<LuauExecutionTaskLogs>(
                url,
                {
                    headers: { 'x-api-key': config.robloxApiKey }
                }
            );
            
            if (response.data.luauExecutionSessionTaskLogs && response.data.luauExecutionSessionTaskLogs.length > 0) {
                 return response.data.luauExecutionSessionTaskLogs[0].messages.join('\n');
            }
            return '';
        } catch (error) {
             console.error('Error fetching Luau execution task logs:', error instanceof Error ? error.message : error);
             // Logs might not be available or empty, returning empty string is safer than crashing
             return '';
        }
    }
}

export const robloxService = RobloxService.getInstance();