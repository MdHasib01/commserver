import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const communitySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    icon: {
      type: String,
      required: true,
      default:
        "http://res.cloudinary.com/mdhasib/image/upload/v1757133279/jhjgy8r5uuellcbqmts7.png",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "entrepreneurs",
        "startups",
        "small-business",
        "business-general",
        "marketing",
        "entrepreneurial-ride",
        "business-ideas",
        "saas-owners",
        "personal-finance",
        "law-advice",
        "sales",
        "e-commerce",
      ],
      index: true,
    },
    scrapingPlatforms: [
      {
        platform: {
          type: String,
          enum: ["reddit"],
          required: true,
        },
        sourceUrl: {
          type: String,
          required: true,
        },
        keywords: [String],
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    memberCount: {
      type: Number,
      default: 0,
    },
    postCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastScrapedAt: {
      type: Date,
    },
    scrapingConfig: {
      frequency: {
        type: String,
        enum: ["hourly", "daily", "weekly"],
        default: "daily",
      },
      maxPostsPerScrape: {
        type: Number,
        default: 50,
      },
      qualityThreshold: {
        type: Number,
        default: 0.5,
      },
    },
  },
  {
    timestamps: true,
  }
);

communitySchema.plugin(mongooseAggregatePaginate);

// Index for efficient querying
communitySchema.index({ category: 1, isActive: 1 });
communitySchema.index({ "scrapingPlatforms.platform": 1 });

export const Community = mongoose.model("Community", communitySchema);
