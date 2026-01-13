import mongoose from 'mongoose';
import { config } from '../config';
import { BlacklistModel } from './models/Blacklist';
import { PlaceCacheModel } from './models/PlaceCache';

interface InMemoryPlaceCache {
    universeId: number;
    expiresAt: number;
}

class DatabaseManager {
    private static instance: DatabaseManager;
    private isInMemory: boolean = false;
    private inMemoryStore: Map<string, any> = new Map();
    private inMemoryBlacklist: Set<string> = new Set();
    private inMemoryPlaceCache: Map<string, InMemoryPlaceCache> = new Map();

    private constructor() {}

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    public async connect(): Promise<void> {
        if (config.mongoDbUri) {
            try {
                await mongoose.connect(config.mongoDbUri, {
                    dbName: config.mongoDbName
                });
                console.log(`Successfully connected to MongoDB (${config.mongoDbName || 'default'}).`);
                this.isInMemory = false;
            } catch (error) {
                console.error('Error connecting to MongoDB, falling back to In-Memory store:', error);
                this.isInMemory = true;
            }
        } else {
            console.log('MONGODB_URI not provided. Using In-Memory store.');
            this.isInMemory = true;
        }
    }

    public isConnectedToMongo(): boolean {
        return !this.isInMemory && mongoose.connection.readyState === 1;
    }

    public async disconnect(): Promise<void> {
        if (!this.isInMemory) {
            try {
                await mongoose.disconnect();
                console.log('Successfully disconnected from MongoDB.');
            } catch (error) {
                console.error('Error disconnecting from MongoDB:', error);
            }
        }
    }

    // Blacklist Methods
    public async addBlacklist(userId: string): Promise<void> {
        if (this.isInMemory) {
            this.inMemoryBlacklist.add(userId);
        } else {
            try {
                await BlacklistModel.create({ userId });
            } catch (error: any) {
                if (error.code === 11000) return; // Duplicate key, ignore
                throw error;
            }
        }
    }

    public async removeBlacklist(userId: string): Promise<void> {
        if (this.isInMemory) {
            this.inMemoryBlacklist.delete(userId);
        } else {
            await BlacklistModel.deleteOne({ userId });
        }
    }

    public async isBlacklisted(userId: string): Promise<boolean> {
        if (this.isInMemory) {
            return this.inMemoryBlacklist.has(userId);
        } else {
            const entry = await BlacklistModel.findOne({ userId });
            return !!entry;
        }
    }

    // PlaceCache Methods
    public async getPlaceCache(placeId: string): Promise<number | null> {
        if (this.isInMemory) {
            const cached = this.inMemoryPlaceCache.get(placeId);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.universeId;
            }
            if (cached) {
                this.inMemoryPlaceCache.delete(placeId);
            }
            return null;
        } else {
            const entry = await PlaceCacheModel.findOne({ placeId });
            return entry ? entry.universeId : null;
        }
    }

    public async setPlaceCache(placeId: string, universeId: number): Promise<void> {
        if (this.isInMemory) {
            this.inMemoryPlaceCache.set(placeId, {
                universeId,
                expiresAt: Date.now() + 3600 * 1000 // 1 hour
            });
        } else {
            try {
                await PlaceCacheModel.create({ placeId, universeId });
            } catch (error: any) {
                if (error.code === 11000) return; // Duplicate key, ignore
                throw error;
            }
        }
    }
}

export const dbManager = DatabaseManager.getInstance();
export const connectDatabase = () => dbManager.connect();
export const disconnectDatabase = () => dbManager.disconnect();