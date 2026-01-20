import mongoose, { Schema } from "mongoose";

const watchedLessonSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    courseContentId: {
      type: Schema.Types.ObjectId,
      ref: "CourseContent",
      required: true,
      index: true,
    },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

watchedLessonSchema.index({ userId: 1, courseContentId: 1 }, { unique: true });

export const WatchedLesson = mongoose.model("WatchedLesson", watchedLessonSchema);

