import mongoose from "mongoose";
import { Module } from "../models/module.model.js";
import { CourseContent } from "../models/courseContent.model.js";
import { WatchedLesson } from "../models/watchedLesson.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  pickDefined,
  requireNonNegativeNumber,
  requireObjectId,
  requireString,
} from "../utils/validation.js";

export const createContent = asyncHandler(async (req, res) => {
  const title = requireString(req.body?.title, "title");
  const description = requireString(req.body?.description, "description");
  const duration = requireNonNegativeNumber(req.body?.duration, "duration");
  const youtubeVideoLink = requireString(
    req.body?.youtubeVideoLink,
    "youtubeVideoLink"
  );
  const moduleId = requireObjectId(req.body?.moduleId, "moduleId");

  const moduleDoc = await Module.findById(moduleId);
  if (!moduleDoc) throw new ApiError(404, "Module not found");

  let content;
  try {
    content = await CourseContent.create({
      title,
      description,
      duration,
      youtubeVideoLink,
      module: moduleId,
    });
  } catch (err) {
    if (err?.message === "Invalid youtubeVideoLink") {
      throw new ApiError(400, "Invalid youtubeVideoLink");
    }
    throw err;
  }

  return res.status(201).json(new ApiResponse(201, content, "Content created"));
});

export const updateContent = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "content id");

  const updatesRaw = pickDefined(req.body || {}, [
    "title",
    "description",
    "duration",
    "youtubeVideoLink",
    "moduleId",
  ]);

  const updates = {};
  if (updatesRaw.title !== undefined)
    updates.title = requireString(updatesRaw.title, "title");
  if (updatesRaw.description !== undefined) {
    updates.description = requireString(updatesRaw.description, "description");
  }
  if (updatesRaw.duration !== undefined) {
    updates.duration = requireNonNegativeNumber(
      updatesRaw.duration,
      "duration"
    );
  }
  if (updatesRaw.youtubeVideoLink !== undefined) {
    updates.youtubeVideoLink = requireString(
      updatesRaw.youtubeVideoLink,
      "youtubeVideoLink"
    );
  }
  if (updatesRaw.moduleId !== undefined) {
    const moduleId = requireObjectId(updatesRaw.moduleId, "moduleId");
    const moduleDoc = await Module.findById(moduleId);
    if (!moduleDoc) throw new ApiError(404, "Module not found");
    updates.module = moduleId;
  }

  if (Object.keys(updates).length === 0)
    throw new ApiError(400, "No valid fields to update");

  try {
    const updated = await CourseContent.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updated) throw new ApiError(404, "Content not found");

    return res
      .status(200)
      .json(new ApiResponse(200, updated, "Content updated"));
  } catch (err) {
    if (err?.message === "Invalid youtubeVideoLink") {
      throw new ApiError(400, "Invalid youtubeVideoLink");
    }
    throw err;
  }
});

export const getAllContents = asyncHandler(async (_req, res) => {
  const contents = await CourseContent.find({}).sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new ApiResponse(200, contents, "Contents fetched"));
});

export const getContentById = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "content id");

  const content = await CourseContent.findById(req.params.id);
  if (!content) throw new ApiError(404, "Content not found");

  return res.status(200).json(new ApiResponse(200, content, "Content fetched"));
});

export const deleteContent = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "content id");

  const session = await mongoose.startSession();
  try {
    let result;
    try {
      result = await session.withTransaction(async () => {
        const content = await CourseContent.findById(req.params.id).session(
          session
        );
        if (!content) throw new ApiError(404, "Content not found");

        await WatchedLesson.deleteMany({
          courseContentId: content._id,
        }).session(session);
        await CourseContent.deleteOne({ _id: content._id }).session(session);

        return { deleted: true };
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const message = err?.message || "";
      const isTxnUnsupported =
        /Transaction numbers are only allowed|replica set|mongos|ReplicaSetNoPrimary/i.test(
          message
        );
      if (!isTxnUnsupported) throw err;

      const content = await CourseContent.findById(req.params.id);
      if (!content) throw new ApiError(404, "Content not found");

      await WatchedLesson.deleteMany({ courseContentId: content._id });
      await CourseContent.deleteOne({ _id: content._id });
      result = { deleted: true };
    }

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Content deleted"));
  } finally {
    session.endSession();
  }
});
