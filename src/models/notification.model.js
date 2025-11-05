import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["unread", "read"],
      default: "unread",
      index: true,
    },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);