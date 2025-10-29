import mongoose, { isValidObjectId } from "mongoose";
import { Post } from "../models/post.model.js";
import { Community } from "../models/community.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getAllPosts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    community,
    platform,
    sortBy = "createdAt",
    sortType = "desc",
    search,
    minQualityScore = 0,
  } = req.query;

  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = (pageNumber - 1) * limitNumber;

  const pipeline = [];

  // Build match conditions
  const matchConditions = { status: "active" };

  if (req.query.authentic !== "false") {
    matchConditions["scrapingMetadata.isAuthentic"] = true;
  }

  let communityId = null;

  if (community) {
    const communityDoc = await Community.findOne({ slug: community });
    communityId = communityDoc ? communityDoc._id : null;
  }

  if (platform) {
    matchConditions.platform = platform;
  }

  if (minQualityScore > 0) {
    matchConditions["scrapingMetadata.qualityScore"] = {
      $gte: parseFloat(minQualityScore),
    };
  }

  pipeline.push({ $match: matchConditions });

  // Add search functionality
  const searchTerm = search?.toString().trim();
  if (searchTerm) {
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedTerm, "i");

    pipeline.push({
      $match: {
        $or: [
          { title: searchRegex },
          { content: searchRegex },
          { "scrapingMetadata.tags": searchRegex },
        ],
      },
    });
  }

  if (communityId) {
    pipeline.push({
      $match: {
        community: communityId,
      },
    });
  }

  pipeline.push({
    $addFields: {
      totalEngagement: {
        $add: [
          { $ifNull: ["$localEngagement.likes", 0] },
          { $ifNull: ["$localEngagement.comments", 0] },
          { $ifNull: ["$localEngagement.bookmarks", 0] },
        ],
      },
    },
  });

  const sortField =
    typeof sortBy === "string" && sortBy.trim().length
      ? sortBy.trim()
      : "createdAt";
  const sortOrder = sortType === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortField]: sortOrder } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limitNumber },
        {
          $lookup: {
            from: "communities",
            localField: "community",
            foreignField: "_id",
            as: "communityDetails",
            pipeline: [
              {
                $project: {
                  name: 1,
                  category: 1,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "ownerDetails",
            pipeline: [
              {
                $project: {
                  username: 1,
                  fullName: 1,
                  avatar: 1,
                },
              },
            ],
          },
        },
        {
          $addFields: {
            community: { $first: "$communityDetails" },
            owner: { $first: "$ownerDetails" },
          },
        },
        {
          $project: {
            communityDetails: 0,
            ownerDetails: 0,
          },
        },
      ],
      totalCount: [{ $count: "count" }],
    },
  });

  pipeline.push(
    {
      $addFields: {
        docs: "$data",
        totalDocs: {
          $ifNull: [{ $first: "$totalCount.count" }, 0],
        },
      },
    },
    {
      $project: {
        docs: 1,
        totalDocs: 1,
      },
    }
  );

  const aggregateResult = await Post.aggregate(pipeline).allowDiskUse(true);
  const { docs = [], totalDocs = 0 } = aggregateResult[0] || {};
  const totalPages =
    totalDocs > 0 ? Math.ceil(totalDocs / limitNumber) : 0;
  const hasPrevPage = totalPages > 0 && pageNumber > 1;
  const hasNextPage = totalPages > 0 && pageNumber < totalPages;
  const pagingCounter = totalDocs > 0 ? skip + 1 : 0;

  const posts = {
    docs,
    totalDocs,
    limit: limitNumber,
    page: pageNumber,
    totalPages,
    pagingCounter,
    hasPrevPage,
    hasNextPage,
    prevPage: hasPrevPage ? pageNumber - 1 : null,
    nextPage: hasNextPage ? pageNumber + 1 : null,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

const createPost = asyncHandler(async (req, res) => {
  const {
    title,
    content,
    community,
    platform,
    sourceUrl,
    originalId,
    tags,
    thumbnail,
    mediaUrls,
    status,
    scrapingMetadata = {},
  } = req.body;

  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  const postingUser = await User.findById(req.user._id).select(
    "username fullName avatar email"
  );

  if (!postingUser) {
    throw new ApiError(401, "Invalid access token");
  }

  if (!title?.trim()) {
    throw new ApiError(400, "Post title is required");
  }

  if (!content?.trim()) {
    throw new ApiError(400, "Post content is required");
  }

  if (!community?.toString().trim()) {
    throw new ApiError(400, "Community identifier is required");
  }

  const communityIdentifier = community.toString().trim();
  let communityDoc = null;

  if (isValidObjectId(communityIdentifier)) {
    communityDoc = await Community.findById(communityIdentifier);
  } else {
    communityDoc = await Community.findOne({
      slug: communityIdentifier.toLowerCase(),
    });
  }

  if (!communityDoc) {
    throw new ApiError(404, "Community not found");
  }

  const allowedPlatforms = ["reddit"];
  const resolvedPlatform = (platform || "reddit").toLowerCase();

  if (!allowedPlatforms.includes(resolvedPlatform)) {
    throw new ApiError(
      400,
      `Invalid platform. Allowed values: ${allowedPlatforms.join(", ")}`
    );
  }

  const manualId = new mongoose.Types.ObjectId().toString();
  const resolvedOriginalId =
    originalId?.toString().trim() || `manual_${manualId}`;
  const resolvedSourceUrl =
    sourceUrl?.toString().trim() ||
    `manual://${resolvedPlatform}/${manualId}`;

  const [existingBySource, existingByOriginal] = await Promise.all([
    Post.findOne({ sourceUrl: resolvedSourceUrl }),
    Post.findOne({
      originalId: resolvedOriginalId,
      platform: resolvedPlatform,
    }),
  ]);

  if (existingBySource) {
    throw new ApiError(409, "A post with this source already exists");
  }

  if (existingByOriginal) {
    throw new ApiError(
      409,
      "A post with this identifier already exists on the selected platform"
    );
  }

  const sanitizedTags = Array.isArray(tags)
    ? tags.filter((tag) => typeof tag === "string" && tag.trim())
    : null;

  const metadataPayload = {
    scrapedAt:
      scrapingMetadata.scrapedAt && !isNaN(new Date(scrapingMetadata.scrapedAt))
        ? new Date(scrapingMetadata.scrapedAt)
        : new Date(),
    originalAuthor:
      scrapingMetadata.originalAuthor ||
      postingUser.fullName ||
      postingUser.username,
    originalCreatedAt: scrapingMetadata.originalCreatedAt,
    qualityScore:
      typeof scrapingMetadata.qualityScore === "number"
        ? scrapingMetadata.qualityScore
        : 0.7,
    authenticityScore:
      typeof scrapingMetadata.authenticityScore === "number"
        ? scrapingMetadata.authenticityScore
        : 0.9,
    tags: sanitizedTags && sanitizedTags.length > 0 ? sanitizedTags : undefined,
    contentType: scrapingMetadata.contentType || "general",
    isAuthentic:
      typeof scrapingMetadata.isAuthentic === "boolean"
        ? scrapingMetadata.isAuthentic
        : true,
    validationMethod:
      scrapingMetadata.validationMethod || "manual-create-controller",
    contentFingerprint: scrapingMetadata.contentFingerprint,
  };

  const postPayload = {
    title: title.trim(),
    content,
    sourceUrl: resolvedSourceUrl,
    platform: resolvedPlatform,
    originalId: resolvedOriginalId,
    community: communityDoc._id,
    owner: req.user._id,
    status: status && ["active", "hidden", "flagged", "deleted"].includes(status)
      ? status
      : "active",
    thumbnail: thumbnail?.toString().trim() || undefined,
    scrapingMetadata: metadataPayload,
  };

  if (mediaUrls) {
    postPayload.mediaUrls = Array.isArray(mediaUrls)
      ? mediaUrls
      : [mediaUrls].filter(Boolean);
  }

  const createdPost = await Post.create(postPayload);

  await Community.findByIdAndUpdate(communityDoc._id, {
    $inc: { postCount: 1 },
  });

  const populatedPost = await Post.findById(createdPost._id)
    .populate({
      path: "owner",
      select: "username fullName avatar email",
    })
    .populate({
      path: "community",
      select: "name slug category",
    });

  return res
    .status(201)
    .json(
      new ApiResponse(201, populatedPost, "Post created successfully")
    );
});

const getPostById = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  const post = await Post.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(postId),
        status: "active",
      },
    },
    {
      $lookup: {
        from: "communities",
        localField: "community",
        foreignField: "_id",
        as: "community",
        pipeline: [
          {
            $project: {
              name: 1,
              category: 1,
              description: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        community: { $first: "$community" },
        owner: { $first: "$owner" },
        totalEngagement: {
          $add: [
            "$localEngagement.likes",
            "$localEngagement.comments",
            "$localEngagement.bookmarks",
          ],
        },
      },
    },
  ]);

  if (!post.length) {
    throw new ApiError(404, "Post not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post[0], "Post fetched successfully"));
});

const updatePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { title, content, status, isPromoted } = req.body;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  // Only allow certain fields to be updated
  const updateData = {};
  if (title) updateData.title = title;
  if (content) updateData.content = content;
  if (status) updateData.status = status;
  if (typeof isPromoted === "boolean") updateData.isPromoted = isPromoted;

  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).populate([
    {
      path: "community",
      select: "name category",
    },
    {
      path: "owner",
      select: "username fullName avatar",
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPost, "Post updated successfully"));
});

const deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  if (post.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to delete this post");
  }

  if (post.status === "deleted") {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Post already deleted"));
  }

  // Soft delete - mark as deleted instead of removing
  await Post.findByIdAndUpdate(postId, { status: "deleted" });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Post deleted successfully"));
});

const togglePostLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  // For now, just increment the like count
  // In a full implementation, you'd track individual user likes
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { "localEngagement.likes": 1 } },
    { new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedPost, "Post liked successfully"));
});

const getPostsByPlatform = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const validPlatforms = ["reddit"];
  if (!validPlatforms.includes(platform)) {
    throw new ApiError(400, "Invalid platform");
  }

  const pipeline = [
    {
      $match: {
        platform: platform,
        status: "active",
      },
    },
    {
      $lookup: {
        from: "communities",
        localField: "community",
        foreignField: "_id",
        as: "community",
        pipeline: [
          {
            $project: {
              name: 1,
              category: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        community: { $first: "$community" },
        owner: { $first: "$owner" },
      },
    },
  ];

  // Sort
  const sortOrder = sortType === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortBy]: sortOrder } });

  const postAggregate = Post.aggregate(pipeline);
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const posts = await Post.aggregatePaginate(postAggregate, options);

  return res
    .status(200)
    .json(
      new ApiResponse(200, posts, `Posts from ${platform} fetched successfully`)
    );
});
const getPostsByCommunity = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  const validPlatforms = ["reddit"];
  if (!validPlatforms.includes(platform)) {
    throw new ApiError(400, "Invalid platform");
  }

  const pipeline = [
    {
      $match: {
        platform: platform,
        status: "active",
      },
    },
    {
      $lookup: {
        from: "communities",
        localField: "community",
        foreignField: "_id",
        as: "community",
        pipeline: [
          {
            $project: {
              name: 1,
              category: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        community: { $first: "$community" },
        owner: { $first: "$owner" },
      },
    },
  ];

  // Sort
  const sortOrder = sortType === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortBy]: sortOrder } });

  const postAggregate = Post.aggregate(pipeline);
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const posts = await Post.aggregatePaginate(postAggregate, options);

  return res
    .status(200)
    .json(
      new ApiResponse(200, posts, `Posts from ${platform} fetched successfully`)
    );
});

const getPostStats = asyncHandler(async (req, res) => {
  const stats = await Post.aggregate([
    {
      $match: { status: "active" },
    },
    {
      $group: {
        _id: null,
        totalPosts: { $sum: 1 },
        platformBreakdown: {
          $push: "$platform",
        },
        avgQualityScore: {
          $avg: "$scrapingMetadata.qualityScore",
        },
        totalEngagement: {
          $sum: {
            $add: [
              "$localEngagement.likes",
              "$localEngagement.comments",
              "$localEngagement.bookmarks",
            ],
          },
        },
      },
    },
    {
      $addFields: {
        platformStats: {
          $reduce: {
            input: "$platformBreakdown",
            initialValue: {},
            in: {
              $mergeObjects: [
                "$$value",
                {
                  $arrayToObject: [
                    [
                      {
                        k: "$$this",
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                {
                                  $getField: {
                                    field: "$$this",
                                    input: "$$value",
                                  },
                                },
                                0,
                              ],
                            },
                            1,
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $project: {
        platformBreakdown: 0,
      },
    },
  ]);

  const result =
    stats.length > 0
      ? stats[0]
      : {
          totalPosts: 0,
          platformStats: {},
          avgQualityScore: 0,
          totalEngagement: 0,
        };

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Post stats fetched successfully"));
});
const getPostByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortType = "desc",
  } = req.query;

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const pipeline = [
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        status: "active",
      },
    },
    {
      $lookup: {
        from: "communities",
        localField: "community",
        foreignField: "_id",
        as: "communityDetails",
        pipeline: [
          {
            $project: {
              name: 1,
              category: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        community: { $first: "$communityDetails" },
        owner: { $first: "$ownerDetails" },
        totalEngagement: {
          $add: [
            "$localEngagement.likes",
            "$localEngagement.comments",
            "$localEngagement.bookmarks",
          ],
        },
      },
    },
    {
      $project: {
        communityDetails: 0,
        ownerDetails: 0,
      },
    },
  ];

  // Sort
  const sortOrder = sortType === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortBy]: sortOrder } });

  // Pagination
  const postAggregate = Post.aggregate(pipeline);
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const posts = await Post.aggregatePaginate(postAggregate, options);

  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts from user fetched successfully"));
});

export {
  getAllPosts,
  createPost,
  getPostById,
  updatePost,
  deletePost,
  togglePostLike,
  getPostsByPlatform,
  getPostStats,
  getPostByUser,
};
