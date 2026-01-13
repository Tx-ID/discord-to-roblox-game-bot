import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaceCache extends Document {
    placeId: string;
    universeId: number;
    createdAt: Date;
}

const PlaceCacheSchema: Schema = new Schema({
    placeId: { type: String, required: true, unique: true },
    universeId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, expires: 3600 } // TTL index: expires after 3600 seconds (1 hour)
});

export const PlaceCacheModel = mongoose.model<IPlaceCache>('PlaceCache', PlaceCacheSchema);
