import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Notification } from "../models/notification.model.js";

const getUnreadNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ status: "unread" })
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, notifications, "Unread notifications fetched"));
});

const markAllUnreadAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { status: "unread" },
    { $set: { status: "read" } }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, { matched: result.matchedCount, modified: result.modifiedCount }, "All unread notifications marked as read")
    );
});

export { getUnreadNotifications, markAllUnreadAsRead };