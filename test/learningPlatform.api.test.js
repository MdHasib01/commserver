import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { Course } from "../src/models/course.model.js";
import { Module } from "../src/models/module.model.js";
import { CourseContent } from "../src/models/courseContent.model.js";
import { WatchedLesson } from "../src/models/watchedLesson.model.js";

let mongo;
let server;
let baseUrl;
let adminToken;
let userToken;

async function jsonRequest(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { res, json };
}

before(async () => {
  process.env.ACCESS_TOKEN_SECRET =
    process.env.ACCESS_TOKEN_SECRET || "test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(`${mongo.getUri()}community`);
  server = app.listen(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  server?.close?.();
  await mongoose.disconnect();
  await mongo?.stop?.();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();

  const admin = await User.create({
    username: "admin",
    email: "admin@example.com",
    fullName: "Admin",
    password: "password123",
    role: "admin",
    isVerified: true,
  });

  const user = await User.create({
    username: "user",
    email: "user@example.com",
    fullName: "User",
    password: "password123",
    role: "user",
    isVerified: true,
  });

  adminToken = jwt.sign({ _id: admin._id }, process.env.ACCESS_TOKEN_SECRET);
  userToken = jwt.sign({ _id: user._id }, process.env.ACCESS_TOKEN_SECRET);
});

describe("Courses CRUD", () => {
  it("creates and fetches course with stats", async () => {
    const create = await jsonRequest("/courses", {
      method: "POST",
      token: adminToken,
      body: { title: "Course 1", description: "Desc" },
    });
    assert.equal(create.res.status, 201);

    const courseId = create.json.data._id;

    const getById = await jsonRequest(`/courses/${courseId}`);
    assert.equal(getById.res.status, 200);
    assert.equal(getById.json.data.totalDuration, 0);
    assert.equal(getById.json.data.lessonsCount, 0);
  });

  it("updates and deletes course", async () => {
    const create = await jsonRequest("/courses", {
      method: "POST",
      token: adminToken,
      body: { title: "Course 1", description: "Desc" },
    });
    const courseId = create.json.data._id;

    const update = await jsonRequest(`/courses/${courseId}`, {
      method: "PUT",
      token: adminToken,
      body: { title: "Course 2" },
    });
    assert.equal(update.res.status, 200);
    assert.equal(update.json.data.title, "Course 2");

    const all = await jsonRequest("/courses");
    assert.equal(all.res.status, 200);
    assert.equal(all.json.data.length, 1);

    const del = await jsonRequest(`/courses/${courseId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(del.res.status, 200);
  });

  it("prevents non-admin from creating course", async () => {
    const create = await jsonRequest("/courses", {
      method: "POST",
      token: userToken,
      body: { title: "Course 1", description: "Desc" },
    });
    assert.equal(create.res.status, 403);
  });

  it("rejects invalid course id", async () => {
    const res = await jsonRequest("/courses/not-an-id");
    assert.equal(res.res.status, 400);
  });
});

describe("Modules and contents stats aggregation", () => {
  it("returns module stats and course stats", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });

    await jsonRequest("/contents", {
      method: "POST",
      token: adminToken,
      body: {
        title: "L1",
        description: "LD",
        duration: 10,
        youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
        moduleId: mod._id.toString(),
      },
    });

    const modRes = await jsonRequest(`/modules/${mod._id.toString()}`);
    assert.equal(modRes.res.status, 200);
    assert.equal(modRes.json.data.totalDuration, 10);
    assert.equal(modRes.json.data.lessonsCount, 1);

    const courseRes = await jsonRequest(`/courses/${course._id.toString()}`);
    assert.equal(courseRes.res.status, 200);
    assert.equal(courseRes.json.data.totalDuration, 10);
    assert.equal(courseRes.json.data.lessonsCount, 1);
  });

  it("runs modules CRUD", async () => {
    const course = await Course.create({ title: "C", description: "D" });

    const create = await jsonRequest("/modules", {
      method: "POST",
      token: adminToken,
      body: { title: "M1", description: "MD", courseId: course._id.toString() },
    });
    assert.equal(create.res.status, 201);

    const moduleId = create.json.data._id;

    const update = await jsonRequest(`/modules/${moduleId}`, {
      method: "PUT",
      token: adminToken,
      body: { title: "M2" },
    });
    assert.equal(update.res.status, 200);
    assert.equal(update.json.data.title, "M2");

    const all = await jsonRequest("/modules");
    assert.equal(all.res.status, 200);
    assert.equal(all.json.data.length, 1);

    const del = await jsonRequest(`/modules/${moduleId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(del.res.status, 200);
  });

  it("runs contents CRUD", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });

    const create = await jsonRequest("/contents", {
      method: "POST",
      token: adminToken,
      body: {
        title: "L1",
        description: "LD",
        duration: 10,
        youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
        moduleId: mod._id.toString(),
      },
    });
    assert.equal(create.res.status, 201);

    const contentId = create.json.data._id;

    const byId = await jsonRequest(`/contents/${contentId}`);
    assert.equal(byId.res.status, 200);
    assert.ok(byId.json.data.thumbnail);

    const update = await jsonRequest(`/contents/${contentId}`, {
      method: "PUT",
      token: adminToken,
      body: { duration: 12 },
    });
    assert.equal(update.res.status, 200);
    assert.equal(update.json.data.duration, 12);

    const all = await jsonRequest("/contents");
    assert.equal(all.res.status, 200);
    assert.equal(all.json.data.length, 1);

    const del = await jsonRequest(`/contents/${contentId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(del.res.status, 200);
  });

  it("rejects invalid content creation payload", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });

    const create = await jsonRequest("/contents", {
      method: "POST",
      token: adminToken,
      body: {
        title: "L1",
        description: "LD",
        duration: -1,
        youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
        moduleId: mod._id.toString(),
      },
    });
    assert.equal(create.res.status, 400);
  });
});

describe("Watched lessons and progress", () => {
  it("returns null when no token provided", async () => {
    const res = await jsonRequest("/progress");
    assert.equal(res.res.status, 200);
    assert.equal(res.json.data, null);
  });

  it("marks watched and returns progress count", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });
    const content = await CourseContent.create({
      title: "L1",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    });

    const watched = await jsonRequest("/watched", {
      method: "POST",
      token: userToken,
      body: { courseContentId: content._id.toString() },
    });
    assert.equal(watched.res.status, 201);

    const progress = await jsonRequest("/progress", { token: userToken });
    assert.equal(progress.res.status, 200);
    assert.equal(progress.json.data.watchedLessonsCount, 1);

    const stored = await WatchedLesson.findOne({
      userId: jwt.decode(userToken)._id,
      courseContentId: content._id,
    });
    assert.ok(stored);
  });

  it("returns watched content ids for authenticated user", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });
    const content1 = await CourseContent.create({
      title: "L1",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    });
    const content2 = await CourseContent.create({
      title: "L2",
      description: "LD",
      duration: 10,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    });

    await jsonRequest("/watched", {
      method: "POST",
      token: userToken,
      body: { courseContentId: content1._id.toString() },
    });
    await jsonRequest("/watched", {
      method: "POST",
      token: userToken,
      body: { courseContentId: content2._id.toString() },
    });

    const watchedIds = await jsonRequest("/watched", { token: userToken });
    assert.equal(watchedIds.res.status, 200);
    assert.equal(Array.isArray(watchedIds.json.data.courseContentIds), true);
    assert.equal(watchedIds.json.data.courseContentIds.length, 2);
  });

  it("requires authentication for watched", async () => {
    const res = await jsonRequest("/watched", {
      method: "POST",
      body: { courseContentId: new mongoose.Types.ObjectId().toString() },
    });
    assert.equal(res.res.status, 401);
  });

  it("rejects invalid token for progress", async () => {
    const res = await jsonRequest("/progress", {
      token: "invalid.token.value",
    });
    assert.equal(res.res.status, 401);
  });
});

describe("Aggregation performance", () => {
  it("computes course stats within reasonable time", async () => {
    const course = await Course.create({ title: "C", description: "D" });
    const mod = await Module.create({
      title: "M",
      description: "MD",
      course: course._id,
    });
    const createPayloads = Array.from({ length: 500 }, (_, i) => ({
      title: `L${i}`,
      description: "LD",
      duration: 1,
      youtubeVideoLink: "https://youtu.be/dQw4w9WgXcQ",
      module: mod._id,
    }));

    await CourseContent.insertMany(createPayloads);

    const start = performance.now();
    const res = await jsonRequest(`/courses/${course._id.toString()}`);
    const elapsed = performance.now() - start;

    assert.equal(res.res.status, 200);
    assert.equal(res.json.data.totalDuration, 500);
    assert.equal(res.json.data.lessonsCount, 500);
    assert.ok(elapsed < 2000);
  });
});
