import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface Config {
    discordToken: string;
    discordClientId: string;
    discordGuildId?: string;
    robloxApiKey: string;
    mongoDbUri?: string;
    mongoDbName?: string;
}

class Configuration {
    private static instance: Configuration;
    public readonly discordToken: string;
    public readonly discordClientId: string;
    public readonly discordGuildId?: string;
    public readonly robloxApiKey: string;
    public readonly mongoDbUri?: string;
    public readonly mongoDbName?: string;

    private constructor() {
        const token = process.env.DISCORD_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;
        const guildId = process.env.DISCORD_GUILD_ID;
        const robloxKey = process.env.ROBLOX_API_KEY;
        const mongoUri = process.env.MONGODB_URI;
        const mongoDbName = process.env.MONGODB_DB_NAME;

        if (!token) {
            throw new Error('Missing environment variable: DISCORD_TOKEN');
        }

        if (!clientId) {
            throw new Error('Missing environment variable: DISCORD_CLIENT_ID');
        }

        if (!robloxKey) {
            throw new Error('Missing environment variable: ROBLOX_API_KEY');
        }

        this.discordToken = token;
        this.discordClientId = clientId;
        this.discordGuildId = guildId;
        this.robloxApiKey = robloxKey;
        this.mongoDbUri = mongoUri;
        this.mongoDbName = mongoDbName || 'perseus';
    }

    public static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }
}

export const config = Configuration.getInstance();