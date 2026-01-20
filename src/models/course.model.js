import mongoose, { Schema } from "mongoose";

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

courseSchema.virtual("modules", {
  ref: "Module",
  localField: "_id",
  foreignField: "course",
});

export const Course = mongoose.model("Course", courseSchema);

