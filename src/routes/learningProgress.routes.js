import { Router } from "express";
import {
  getProgress,
  getWatchedContentIds,
  markWatched,
} from "../controllers/learningProgress.controller.js";
import { verifyJWT, verifyJWTOptional } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";

const router = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "progress:" });

router.route("/watched").post(verifyJWT, markWatched).get(verifyJWT, getWatchedContentIds);
router.route("/progress").get(publicLimiter, verifyJWTOptional, getProgress);

export default router;
