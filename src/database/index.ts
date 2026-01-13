import mongoose from 'mongoose';
import { config } from '../config';
import { BlacklistModel } from './models/Blacklist';
import { PlaceCacheModel } from './models/PlaceCache';
import { UserCacheModel } from './models/UserCache';

interface InMemoryPlaceCache {
    universeId: number;
    expiresAt: number;
}

interface InMemoryUserCache {
    name: string;
    displayName: string;
    expiresAt: number;
}

export interface CachedUser {
    id: number;
    name: string;
    displayName: string;
}

class DatabaseManager {
    private static instance: DatabaseManager;
    private isInMemory: boolean = false;
    private inMemoryStore: Map<string, any> = new Map();
    private inMemoryBlacklist: Set<string> = new Set();
    private inMemoryPlaceCache: Map<string, InMemoryPlaceCache> = new Map();
    private inMemoryUserCache: Map<number, InMemoryUserCache> = new Map();

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

    // UserCache Methods
    public async getUserCache(userIds: number[]): Promise<CachedUser[]> {
        const results: CachedUser[] = [];
        if (this.isInMemory) {
            for (const id of userIds) {
                const cached = this.inMemoryUserCache.get(id);
                if (cached && cached.expiresAt > Date.now()) {
                    results.push({ id, name: cached.name, displayName: cached.displayName });
                } else if (cached) {
                    this.inMemoryUserCache.delete(id);
                }
            }
        } else {
            const entries = await UserCacheModel.find({ userId: { $in: userIds } });
            entries.forEach(entry => {
                results.push({ id: entry.userId, name: entry.name, displayName: entry.displayName });
            });
        }
        return results;
    }

    public async setUserCache(users: CachedUser[]): Promise<void> {
        if (this.isInMemory) {
            const expiresAt = Date.now() + 86400 * 1000; // 24 hours
            users.forEach(user => {
                this.inMemoryUserCache.set(user.id, {
                    name: user.name,
                    displayName: user.displayName,
                    expiresAt
                });
            });
        } else {
            try {
                // Use bulkWrite for better performance with multiple upserts
                const operations = users.map(user => ({
                    updateOne: {
                        filter: { userId: user.id },
                        update: { 
                            userId: user.id, 
                            name: user.name, 
                            displayName: user.displayName,
                            createdAt: new Date() // Refresh TTL
                        },
                        upsert: true
                    }
                }));
                if (operations.length > 0) {
                    await UserCacheModel.bulkWrite(operations);
                }
            } catch (error) {
                console.error('Error saving to UserCache:', error);
            }
        }
    }
}

export const dbManager = DatabaseManager.getInstance();
export const connectDatabase = () => dbManager.connect();
export const disconnectDatabase = () => dbManager.disconnect();