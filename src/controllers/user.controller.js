import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import emailService from "../services/emailService.js";
import { Otp } from "../models/otp.model.js";
import { GoogleSheetsServices } from "../services/googleSheets.service.js";

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if ([, email, username, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }
  //console.log(req.files);

  const avatarLocalPath = req.files?.avatar[0]?.path;
  //const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  await Otp.create({
    email,
    otp,
  });
  await emailService.sendEmail(
    email,
    "otp",
    {
      otp,
      fullName,
    },
    "OTP for email verification",
    process.env.DEFAULT_FROM_EMAIL
  );
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  //find the user
  //password check
  //access and referesh token
  //send cookie

  const { email, username, password } = req.body;
  console.log(email);

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  // Here is an alternative of above code based on logic discussed in video:
  // if (!(username || email)) {
  //     throw new ApiError(400, "username or email is required")

  // }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (user.userType === "real" && user?.isVerified === false) {
    throw new ApiError(400, "User email is not verified");
  }

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );


  const isProd = process.env.NODE_ENV === "production";

  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const existingOtp = await Otp.findOne({ email });

  if (!existingOtp) {
    throw new ApiError(404, "OTP not found");
  }

  if (existingOtp.otp !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  await Otp.findByIdAndDelete(existingOtp._id);

  await User.findByIdAndUpdate(user._id, {
    $set: {
      isVerified: true,
    },
  });

  // Helper: simple retry with delays
  const retry = async (fn, attempts = 3, delayMs = 1500) => {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        console.error(`Operation failed (attempt ${i + 1}/${attempts}):`, err?.message || err);
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr;
  };

  // Prepare email recipients from env (comma-separated)
  const recipientCsv = process.env.NEW_ACCOUNT_NOTIFICATION_RECIPIENTS || "";
  const recipients = recipientCsv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);

  // Build template payload
  const nowIso = new Date().toISOString();
  const portalUrl = process.env.COMMUNITY_PORTAL_URL || "https://earncore.community";

  // Capture IP address
  const ipAddress =
    (req.headers["x-forwarded-for"]?.split(",")[0] || "").trim() || req.ip || "";

  // 1) Send admin-only notification email (do not email the user)
  let emailError = null;
  try {
    if (recipients.length) {
      await retry(() =>
        emailService.sendEmail(
          recipients,
          "admin_new_user",
          {
            fullName: user.fullName,
            email: user.email,
            username: user.username,
            communityName: "Earn Core Community",
            registeredAt: nowIso,
            portalUrl,
          },
          `New user joined: ${user.username || user.email}`,
          process.env.DEFAULT_FROM_EMAIL,
          null,
          null
        )
      );
      console.log("✅ Admins notified about new user join");
    } else {
      console.warn("⚠️ No admin recipients configured; skipping admin notification");
    }
  } catch (err) {
    emailError = err;
    console.error("❌ Failed to send admin notification after retries:", err?.message || err);
  }

  // 2) Log subscriber in Google Sheets
  let sheetError = null;
  try {
    await retry(() =>
      GoogleSheetsServices.addSubscriber({
        email: user.email,
        subscribedAt: nowIso,
        source: "Earn Core Community Registration",
        ipAddress,
      })
    );
    console.log("✅ Subscriber added to Google Sheets");
  } catch (err) {
    sheetError = err;
    console.error("❌ Failed to add subscriber to Google Sheets after retries:", err?.message || err);
  }

  // 3) Notify administrators if persistent failures occur
  if (emailError || sheetError) {
    const adminCsv = process.env.ADMIN_ALERT_EMAILS || recipientCsv;
    const adminRecipients = adminCsv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    if (adminRecipients.length) {
      try {
        await emailService.sendPlainEmail(
          adminRecipients,
          "[Alert] Registration post-verify operation failures",
          `User: ${user.email}\nVerified: ${nowIso}\nIP: ${ipAddress}\nEmailError: ${emailError?.message || "none"}\nSheetsError: ${sheetError?.message || "none"}`,
          process.env.DEFAULT_FROM_EMAIL
        );
        console.warn("⚠️ Admins notified about persistent failures");
      } catch (notifyErr) {
        console.error("❌ Failed to notify admins:", notifyErr?.message || notifyErr);
      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Email verified successfully"));
});

// Simple diagnostic to check Google Sheets connectivity and configuration
const testGoogleSheetsConnection = asyncHandler(async (req, res) => {
  try {
    const result = await GoogleSheetsServices.testConnection();

    // Include a quick echo of env presence without exposing sensitive values
    const envStatus = {
      GOOGLE_SHEETS_ID: !!process.env.GOOGLE_SHEETS_ID,
      GOOGLE_SHEETS_NAME: !!process.env.GOOGLE_SHEETS_NAME,
      GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
    };

    return res.status(200).json(
      new ApiResponse(200, { result, envStatus }, "Sheets connectivity check executed")
    );
  } catch (error) {
    throw new ApiError(500, error?.message || "Sheets connectivity check failed");
  }
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});
export const checkValidUser = async (req, res) => {
  try {
    const token =
      req.cookies["accessToken"] || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedToken._id).select("-password");

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ message: "User is valid", user, isValid: true });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email: email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  //TODO: delete old image - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  //TODO: delete old image - assignment

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const profile = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "following",
        as: "followers",
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "_id",
        foreignField: "owner",
        as: "posts",
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "follower",
        as: "following",
      },
    },
    {
      $addFields: {
        followersCount: {
          $size: "$followers",
        },
        followingCount: {
          $size: "$following",
        },
        postsCount: {
          $size: "$posts",
        },
        isFollowing: {
          $cond: {
            if: { $in: [req.user?._id, "$followers.following"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        followersCount: 1,
        followingCount: 1,
        isFollowing: 1,
        avatar: 1,
        postsCount: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!profile?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, profile[0], "User channel fetched successfully")
    );
});
const getUserProfileById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId?.trim()) {
    throw new ApiError(400, "userId is missing");
  }

  const profile = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "following",
        as: "followers",
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "follower",
        as: "following",
      },
    },
    {
      $lookup: {
        from: "posts",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$owner", "$$userId"],
              },
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $unwind: "$owner",
          },
        ],
        as: "posts",
      },
    },
    {
      $lookup: {
        from: "likes",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$likedBy", "$$userId"],
              },
            },
          },
          {
            $lookup: {
              from: "posts",
              let: { postId: "$post" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$_id", "$$postId"],
                    },
                  },
                },
                {
                  $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner",
                    pipeline: [
                      {
                        $project: {
                          fullName: 1,
                          username: 1,
                          avatar: 1,
                        },
                      },
                    ],
                  },
                },
                {
                  $unwind: "$owner",
                },
              ],
              as: "post",
            },
          },
          {
            $unwind: "$post",
          },
        ],
        as: "likes",
      },
    },
    {
      $addFields: {
        followersCount: {
          $size: "$followers",
        },
        followingCount: {
          $size: "$following",
        },
        postsCount: {
          $size: "$posts",
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        followersCount: 1,
        followingCount: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        posts: 1,
        postsCount: 1,
        likes: 1,
      },
    },
  ]);
  if (!profile?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, profile[0], "User channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "following",
        as: "followers",
      },
    },
    {
      $lookup: {
        from: "follows",
        localField: "_id",
        foreignField: "follower",
        as: "following",
      },
    },
    {
      $lookup: {
        from: "posts",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$owner", "$$userId"],
              },
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $unwind: "$owner",
          },
        ],
        as: "posts",
      },
    },
    {
      $lookup: {
        from: "likes",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$likedBy", "$$userId"],
              },
            },
          },
          {
            $lookup: {
              from: "posts",
              let: { postId: "$post" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$_id", "$$postId"],
                    },
                  },
                },
                {
                  $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner",
                    pipeline: [
                      {
                        $project: {
                          fullName: 1,
                          username: 1,
                          avatar: 1,
                        },
                      },
                    ],
                  },
                },
                {
                  $unwind: "$owner",
                },
              ],
              as: "post",
            },
          },
          {
            $unwind: "$post",
          },
        ],
        as: "likes",
      },
    },
    {
      $addFields: {
        followersCount: {
          $size: "$followers",
        },
        followingCount: {
          $size: "$following",
        },
        postsCount: {
          $size: "$posts",
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        followersCount: 1,
        followingCount: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        posts: 1,
        postsCount: 1,
        likes: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, user[0], "My profile fetched successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserProfile,
  getWatchHistory,
  getMyProfile,
  getUserProfileById,
  verifyOTP,
  // Diagnostic: test Google Sheets connectivity
  testGoogleSheetsConnection,
};
