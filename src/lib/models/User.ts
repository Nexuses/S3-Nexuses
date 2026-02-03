import mongoose from "mongoose";

export type UserRole = "user" | "admin";

export interface IUser {
  _id: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
}

const UserSchema = new mongoose.Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], required: true, default: "user" },
  },
  { timestamps: true }
);

export default mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
