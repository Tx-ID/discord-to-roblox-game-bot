import mongoose, { Schema, Document } from 'mongoose';

export interface IBlacklist extends Document {
    userId: string;
    createdAt: Date;
}

const BlacklistSchema: Schema = new Schema({
    userId: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

export const BlacklistModel = mongoose.model<IBlacklist>('Blacklist', BlacklistSchema);
