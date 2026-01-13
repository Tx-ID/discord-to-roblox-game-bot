import mongoose, { Schema, Document } from 'mongoose';

export interface IUserCache extends Document {
    userId: number;
    name: string;
    displayName: string;
    createdAt: Date;
}

const UserCacheSchema: Schema = new Schema({
    userId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL index: expires after 86400 seconds (24 hours)
});

export const UserCacheModel = mongoose.model<IUserCache>('UserCache', UserCacheSchema);
