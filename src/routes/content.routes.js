import { Router } from "express";
import {
  createContent,
  deleteContent,
  getAllContents,
  getContentById,
  updateContent,
} from "../controllers/courseContent.controller.js";
import { verifyJWT, requireAdmin } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";

const router = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "contents:" });

router.route("/").get(publicLimiter, getAllContents).post(verifyJWT, requireAdmin, createContent);

router
  .route("/:id")
  .get(publicLimiter, getContentById)
  .put(verifyJWT, requireAdmin, updateContent)
  .delete(verifyJWT, requireAdmin, deleteContent);

export default router;

