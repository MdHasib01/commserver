import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getUnreadNotifications,
  markAllUnreadAsRead,
} from "../controllers/notification.controller.js";

const router = Router();

// Get all notifications with status=unread
router.get("/getNotification", verifyJWT, getUnreadNotifications);

// Mark all unread notifications to read
router.post("/markAllRead", verifyJWT, markAllUnreadAsRead);

export default router;