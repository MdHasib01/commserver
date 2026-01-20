import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

const corsOptions = {
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// app.options("*", cors(corsOptions));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

import { seedDatabase } from "./data/seedDatabase.js";
import commentRouter from "./routes/comment.routes.js";
import likeRouter from "./routes/like.routes.js";
import followRouter from "./routes/follow.routes.js";
import bookmarkRouter from "./routes/bookmark.routes.js";
import scraperRouter from "./routes/scraper.routes.js";
import postsRouter from "./routes/post.routes.js";
import userRouter from "./routes/user.routes.js";
import communityRouter from "./routes/community.routes.js";
import userScraperRouter from "./routes/userScraper.routes.js";
import userGenerationRouter from "./routes/userGeneration.routes.js";
import autoLikeRouter from "./routes/autoLike.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import { seedUsers } from "./data/seedUsers.js";
import courseRouter from "./routes/course.routes.js";
import moduleRouter from "./routes/module.routes.js";
import contentRouter from "./routes/content.routes.js";
import learningProgressRouter from "./routes/learningProgress.routes.js";
import { ApiError } from "./utils/ApiError.js";

app.get("/api/v1/seed", seedDatabase);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/posts", postsRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/follows", followRouter);
app.use("/api/v1/bookmarks", bookmarkRouter);
app.use("/api/v1/scraper", scraperRouter);
app.use("/api/v1/community", communityRouter);
app.use("/api/v1/user-scraper", userScraperRouter);
app.use("/api/v1/generate-user", userGenerationRouter);
app.use("/api/v1/auto-like", autoLikeRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/courses", courseRouter);
app.use("/api/v1/modules", moduleRouter);
app.use("/api/v1/contents", contentRouter);
app.use("/api/v1", learningProgressRouter);

app.use((err, _req, res, _next) => {
  const statusCode =
    err?.statusCode ||
    (err?.name === "ValidationError" ? 400 : null) ||
    (err?.code === 11000 ? 409 : null) ||
    (err instanceof SyntaxError ? 400 : null) ||
    500;

  const message =
    err?.message ||
    (statusCode === 500 ? "Internal Server Error" : "Request failed");

  const apiError =
    err instanceof ApiError
      ? err
      : new ApiError(statusCode, message, err?.errors || []);

  return res.status(statusCode).json({
    statusCode,
    data: null,
    message: apiError.message,
    success: false,
    errors: apiError.errors || [],
  });
});

export { app };
