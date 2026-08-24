import mongoose from "mongoose";

export interface IBucket {
  _id: string;
  name: string;
  cdnDomain?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BucketSchema = new mongoose.Schema<IBucket>(
  {
    name: { type: String, required: true, unique: true, lowercase: true, trim: true },
    cdnDomain: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Bucket ?? mongoose.model<IBucket>("Bucket", BucketSchema);
