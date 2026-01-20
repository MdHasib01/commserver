import mongoose from "mongoose";
import { Course } from "../models/course.model.js";
import { Module } from "../models/module.model.js";
import { CourseContent } from "../models/courseContent.model.js";
import { WatchedLesson } from "../models/watchedLesson.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  pickDefined,
  requireObjectId,
  requireString,
} from "../utils/validation.js";

export const createModule = asyncHandler(async (req, res) => {
  const title = requireString(req.body?.title, "title");
  const description = requireString(req.body?.description, "description");
  const courseId = requireObjectId(req.body?.courseId, "courseId");

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, "Course not found");

  const moduleDoc = await Module.create({
    title,
    description,
    course: courseId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, moduleDoc, "Module created"));
});

export const updateModule = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "module id");

  const updatesRaw = pickDefined(req.body || {}, [
    "title",
    "description",
    "courseId",
  ]);
  const updates = {};

  if (updatesRaw.title !== undefined)
    updates.title = requireString(updatesRaw.title, "title");
  if (updatesRaw.description !== undefined) {
    updates.description = requireString(updatesRaw.description, "description");
  }
  if (updatesRaw.courseId !== undefined) {
    const courseId = requireObjectId(updatesRaw.courseId, "courseId");
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, "Course not found");
    updates.course = courseId;
  }

  if (Object.keys(updates).length === 0)
    throw new ApiError(400, "No valid fields to update");

  const moduleDoc = await Module.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!moduleDoc) throw new ApiError(404, "Module not found");

  return res
    .status(200)
    .json(new ApiResponse(200, moduleDoc, "Module updated"));
});

export const getAllModules = asyncHandler(async (_req, res) => {
  const modules = await Module.find({}).sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, modules, "Modules fetched"));
});

export const getModuleById = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "module id");

  const moduleDoc = await Module.findById(req.params.id).lean();
  if (!moduleDoc) throw new ApiError(404, "Module not found");

  const stats = await Module.getStatsForModule(req.params.id);

  return res
    .status(200)
    .json(new ApiResponse(200, { ...moduleDoc, ...stats }, "Module fetched"));
});

export const deleteModule = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "module id");

  const session = await mongoose.startSession();
  try {
    let result;
    try {
      result = await session.withTransaction(async () => {
        const moduleDoc = await Module.findById(req.params.id).session(session);
        if (!moduleDoc) throw new ApiError(404, "Module not found");

        const contents = await CourseContent.find(
          { module: moduleDoc._id },
          { _id: 1 }
        )
          .session(session)
          .lean();
        const contentIds = contents.map((c) => c._id);

        if (contentIds.length) {
          await WatchedLesson.deleteMany({
            courseContentId: { $in: contentIds },
          }).session(session);
        }

        await CourseContent.deleteMany({ module: moduleDoc._id }).session(
          session
        );
        await Module.deleteOne({ _id: moduleDoc._id }).session(session);

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

      const moduleDoc = await Module.findById(req.params.id);
      if (!moduleDoc) throw new ApiError(404, "Module not found");

      const contents = await CourseContent.find(
        { module: moduleDoc._id },
        { _id: 1 }
      ).lean();
      const contentIds = contents.map((c) => c._id);

      if (contentIds.length) {
        await WatchedLesson.deleteMany({
          courseContentId: { $in: contentIds },
        });
      }

      await CourseContent.deleteMany({ module: moduleDoc._id });
      await Module.deleteOne({ _id: moduleDoc._id });
      result = { deleted: true };
    }

    return res.status(200).json(new ApiResponse(200, result, "Module deleted"));
  } finally {
    session.endSession();
  }
});
