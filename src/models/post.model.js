import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    content: { type: String, required: true },
    sourceUrl: { type: String, required: true, unique: true }, // @@ Prevent duplicate posts @@
    platform: {
      type: String,
      required: true,
      enum: ["reddit"],
      index: true,
    },
    originalId: { type: String, required: true, index: true },
    community: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    engagementMetrics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },

    scrapingMetadata: {
      scrapedAt: { type: Date, default: Date.now },
      originalAuthor: String,
      originalCreatedAt: Date,
      qualityScore: { type: Number, min: 0, max: 1, default: 0.5 },
      authenticityScore: { type: Number, min: 0, max: 1, default: 0.5 },
      tags: [String],
      contentType: {
        type: String,
        enum: [
          "educational",
          "news",
          "discussion",
          "experience",
          "insights",
          "general",
        ],
        default: "general",
      },
      isAuthentic: { type: Boolean, default: false },
      validationMethod: String,
      contentFingerprint: String,
    },

    status: {
      type: String,
      enum: ["active", "hidden", "flagged", "deleted"],
      default: "active",
      index: true,
    },
    thumbnail: String, // URL to thumbnail
    mediaUrls: [String],

    localEngagement: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      bookmarks: { type: Number, default: 0 },
    },

    isPromoted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

postSchema.plugin(mongooseAggregatePaginate);

// @@ Compound indexes for efficient querying @@
postSchema.index({ community: 1, status: 1, createdAt: -1 });
postSchema.index({ "scrapingMetadata.scrapedAt": -1 });
postSchema.index({ "scrapingMetadata.qualityScore": -1 });
PostSchema.index(
  { platform: 1, originalId: 1 },
  { unique: true, sparse: true }
);
PostSchema.index({ sourceUrl: 1 }, { unique: true, sparse: true });

export const Post = mongoose.model("Post", postSchema);
