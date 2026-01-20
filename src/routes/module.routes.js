import { Router } from "express";
import {
  createModule,
  deleteModule,
  getAllModules,
  getModuleById,
  updateModule,
} from "../controllers/module.controller.js";
import { verifyJWT, requireAdmin } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";

const router = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "modules:" });

router.route("/").get(publicLimiter, getAllModules).post(verifyJWT, requireAdmin, createModule);

router
  .route("/:id")
  .get(publicLimiter, getModuleById)
  .put(verifyJWT, requireAdmin, updateModule)
  .delete(verifyJWT, requireAdmin, deleteModule);

export default router;

