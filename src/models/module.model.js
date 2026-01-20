import mongoose, { Schema } from "mongoose";

const moduleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

moduleSchema.virtual("contents", {
  ref: "CourseContent",
  localField: "_id",
  foreignField: "module",
});

moduleSchema.index({ course: 1, createdAt: -1 });

moduleSchema.statics.getStatsForModule = async function (
  moduleId,
  { session } = {}
) {
  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(moduleId) } },
    {
      $lookup: {
        from: "coursecontents",
        localField: "_id",
        foreignField: "module",
        as: "contents",
        pipeline: [{ $project: { duration: 1 } }],
      },
    },
    {
      $addFields: {
        totalDuration: { $sum: "$contents.duration" },
        lessonsCount: { $size: "$contents" },
      },
    },
    { $project: { _id: 0, totalDuration: 1, lessonsCount: 1 } },
  ];

  const agg = this.aggregate(pipeline);
  if (session) agg.session(session);
  const result = await agg;
  return result?.[0] || { totalDuration: 0, lessonsCount: 0 };
};

moduleSchema.statics.getStatsForCourse = async function (
  courseId,
  { session } = {}
) {
  const pipeline = [
    { $match: { course: new mongoose.Types.ObjectId(courseId) } },
    {
      $lookup: {
        from: "coursecontents",
        localField: "_id",
        foreignField: "module",
        as: "contents",
        pipeline: [{ $project: { duration: 1 } }],
      },
    },
    {
      $addFields: {
        moduleDuration: { $sum: "$contents.duration" },
        moduleLessonsCount: { $size: "$contents" },
      },
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: "$moduleDuration" },
        lessonsCount: { $sum: "$moduleLessonsCount" },
      },
    },
    { $project: { _id: 0, totalDuration: 1, lessonsCount: 1 } },
  ];

  const agg = this.aggregate(pipeline);
  if (session) agg.session(session);
  const result = await agg;
  return result?.[0] || { totalDuration: 0, lessonsCount: 0 };
};

export const Module = mongoose.model("Module", moduleSchema);
