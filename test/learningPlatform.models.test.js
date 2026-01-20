import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Course } from "../src/models/course.model.js";
import { Module } from "../src/models/module.model.js";
import { CourseContent } from "../src/models/courseContent.model.js";
import { parseYouTubeVideoId, getYouTubeThumbnailUrl } from "../src/utils/youtube.js";

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(`${mongo.getUri()}community`);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("YouTube utils", () => {
  it("parses video id from various link formats", () => {
    assert.equal(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1"),
      "dQw4w9WgXcQ"
    );
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
    assert.equal(
      parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ"
    );
  });

  it("returns thumbnail URL from valid link", () => {
    assert.equal(
      getYouTubeThumbnailUrl("https://youtu.be/dQw4w9WgXcQ"),
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
  });
});

describe("CourseContent thumbnail derivation", () => {
  it("derives thumbnail on create", async () => {
    const course = await Course.create({ title: "T", description: "D" });
    const mod = await Module.create({ title: "M", description: "MD", course: course._id });
    const content = await CourseContent.create({
      title: "L1",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    });
    assert.equal(
      content.thumbnail,
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
  });

  it("rejects invalid youtube links", async () => {
    const course = await Course.create({ title: "T", description: "D" });
    const mod = await Module.create({ title: "M", description: "MD", course: course._id });
    await assert.rejects(() =>
      CourseContent.create({
        title: "L1",
        description: "LD",
        duration: 10,
        youtubeVideoLink: "not-a-url",
        module: mod._id,
      })
    );
  });
});

describe("Module stats methods", () => {
  it("computes module stats", async () => {
    const course = await Course.create({ title: "T", description: "D" });
    const mod = await Module.create({ title: "M", description: "MD", course: course._id });

    await CourseContent.create({
      title: "L1",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    });
    await CourseContent.create({
      title: "L2",
      description: "LD",
      duration: 15,
      youtubeVideoLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      module: mod._id,
    });

    const stats = await Module.getStatsForModule(mod._id);
    assert.deepEqual(stats, { totalDuration: 25, lessonsCount: 2 });
  });

  it("computes course stats across modules", async () => {
    const course = await Course.create({ title: "T", description: "D" });
    const mod1 = await Module.create({ title: "M1", description: "MD", course: course._id });
    const mod2 = await Module.create({ title: "M2", description: "MD", course: course._id });

    await CourseContent.create({
      title: "L1",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod1._id,
    });
    await CourseContent.create({
      title: "L2",
      description: "LD",
      duration: 15,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod2._id,
    });

    const stats = await Module.getStatsForCourse(course._id);
    assert.deepEqual(stats, { totalDuration: 25, lessonsCount: 2 });
  });
});

