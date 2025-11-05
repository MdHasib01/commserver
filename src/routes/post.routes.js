import { Router } from "express";
import {
  createPost,
  getAllPosts,
  getPostById,
  deletePost,
  getPostByUser,
  getRealUserPosts,
} from "../controllers/post.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router
  .route("/")
  .get(getAllPosts)
  .post(verifyJWT, createPost);
// Posts created by real users
router.route("/real").get(getRealUserPosts);
router
  .route("/:postId")
  .get(getPostById)
  .delete(verifyJWT, deletePost);

router.use(verifyJWT);
router.route("/user/:userId").get(getPostByUser);

export default router;
