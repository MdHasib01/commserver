import mongoose, { Schema } from "mongoose";
import { getYouTubeThumbnailUrl } from "../utils/youtube.js";

const courseContentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 0 },
    youtubeVideoLink: { type: String, required: true, trim: true },
    thumbnail: { type: String },
    module: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

courseContentSchema.index({ module: 1, createdAt: -1 });

courseContentSchema.pre("validate", function (next) {
  const thumbnail = getYouTubeThumbnailUrl(this.youtubeVideoLink);
  if (!thumbnail) {
    return next(new Error("Invalid youtubeVideoLink"));
  }
  this.thumbnail = thumbnail;
  next();
});

courseContentSchema.pre("insertMany", function (next, docs) {
  for (const doc of docs || []) {
    const thumbnail = getYouTubeThumbnailUrl(doc.youtubeVideoLink);
    if (!thumbnail) {
      return next(new Error("Invalid youtubeVideoLink"));
    }
    doc.thumbnail = thumbnail;
  }
  return next();
});

export const CourseContent = mongoose.model(
  "CourseContent",
  courseContentSchema
);
