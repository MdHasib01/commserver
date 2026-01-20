import { Router } from "express";
import {
  createCourse,
  deleteCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
} from "../controllers/course.controller.js";
import { verifyJWT, requireAdmin } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";

const router = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "courses:" });

router.route("/").get(publicLimiter, getAllCourses).post(verifyJWT, requireAdmin, createCourse);

router
  .route("/:id")
  .get(publicLimiter, getCourseById)
  .put(verifyJWT, requireAdmin, updateCourse)
  .delete(verifyJWT, requireAdmin, deleteCourse);

export default router;

