import mongoose from "mongoose";
import { Course } from "../models/course.model.js";
import { Module } from "../models/module.model.js";
import { CourseContent } from "../models/courseContent.model.js";
import { WatchedLesson } from "../models/watchedLesson.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pickDefined, requireObjectId, requireString } from "../utils/validation.js";

export const createCourse = asyncHandler(async (req, res) => {
  const title = requireString(req.body?.title, "title");
  const description = requireString(req.body?.description, "description");

  const course = await Course.create({ title, description });

  return res.status(201).json(new ApiResponse(201, course, "Course created"));
});

export const updateCourse = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "course id");

  const updatesRaw = pickDefined(req.body || {}, ["title", "description"]);
  const updates = {};
  if (updatesRaw.title !== undefined) updates.title = requireString(updatesRaw.title, "title");
  if (updatesRaw.description !== undefined) {
    updates.description = requireString(updatesRaw.description, "description");
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const course = await Course.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!course) throw new ApiError(404, "Course not found");

  return res.status(200).json(new ApiResponse(200, course, "Course updated"));
});

export const getAllCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find({}).sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, courses, "Courses fetched"));
});

export const getCourseById = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "course id");

  const course = await Course.findById(req.params.id).lean();
  if (!course) throw new ApiError(404, "Course not found");

  const stats = await Module.getStatsForCourse(req.params.id);

  return res
    .status(200)
    .json(new ApiResponse(200, { ...course, ...stats }, "Course fetched"));
});

export const deleteCourse = asyncHandler(async (req, res) => {
  requireObjectId(req.params?.id, "course id");

  const session = await mongoose.startSession();
  try {
    let result;
    try {
      result = await session.withTransaction(async () => {
        const course = await Course.findById(req.params.id).session(session);
        if (!course) throw new ApiError(404, "Course not found");

        const modules = await Module.find({ course: course._id }, { _id: 1 })
          .session(session)
          .lean();
        const moduleIds = modules.map((m) => m._id);

        const contents = moduleIds.length
          ? await CourseContent.find({ module: { $in: moduleIds } }, { _id: 1 })
              .session(session)
              .lean()
          : [];
        const contentIds = contents.map((c) => c._id);

        if (contentIds.length) {
          await WatchedLesson.deleteMany({ courseContentId: { $in: contentIds } }).session(
            session
          );
        }

        if (moduleIds.length) {
          await CourseContent.deleteMany({ module: { $in: moduleIds } }).session(session);
          await Module.deleteMany({ course: course._id }).session(session);
        }

        await Course.deleteOne({ _id: course._id }).session(session);

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

      const course = await Course.findById(req.params.id);
      if (!course) throw new ApiError(404, "Course not found");

      const modules = await Module.find({ course: course._id }, { _id: 1 }).lean();
      const moduleIds = modules.map((m) => m._id);

      const contents = moduleIds.length
        ? await CourseContent.find({ module: { $in: moduleIds } }, { _id: 1 }).lean()
        : [];
      const contentIds = contents.map((c) => c._id);

      if (contentIds.length) {
        await WatchedLesson.deleteMany({ courseContentId: { $in: contentIds } });
      }

      if (moduleIds.length) {
        await CourseContent.deleteMany({ module: { $in: moduleIds } });
        await Module.deleteMany({ course: course._id });
      }

      await Course.deleteOne({ _id: course._id });
      result = { deleted: true };
    }

    return res.status(200).json(new ApiResponse(200, result, "Course deleted"));
  } finally {
    session.endSession();
  }
});
