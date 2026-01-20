import { CourseContent } from "../models/courseContent.model.js";
import { WatchedLesson } from "../models/watchedLesson.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireObjectId } from "../utils/validation.js";

export const markWatched = asyncHandler(async (req, res) => {
  const courseContentId = requireObjectId(
    req.body?.courseContentId,
    "courseContentId"
  );

  const content = await CourseContent.findById(courseContentId, { _id: 1 });
  if (!content) throw new ApiError(404, "Content not found");

  const watched = await WatchedLesson.findOneAndUpdate(
    { userId: req.user._id, courseContentId },
    { $set: { timestamp: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res
    .status(201)
    .json(new ApiResponse(201, watched, "Marked as watched"));
});

export const getProgress = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "No token provided"));
  }

  const count = await WatchedLesson.countDocuments({ userId: req.user._id });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { watchedLessonsCount: count }, "Progress fetched")
    );
});

export const getWatchedContentIds = asyncHandler(async (req, res) => {
  const watched = await WatchedLesson.find({ userId: req.user._id })
    .sort({ timestamp: -1 })
    .select({ _id: 0, courseContentId: 1 })
    .lean();

  const courseContentIds = watched.map((w) => w.courseContentId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { courseContentIds }, "Watched content ids fetched")
    );
});
