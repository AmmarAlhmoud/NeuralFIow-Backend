const express = require("express");
const router = express.Router();
const Comment = require("../models/Comment");
const User = require("../models/User");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");

const createCommentSchema = z.object({
  body: z.object({
    taskId: commonSchemas.mongoId,
    body: z.string().min(1).max(2000),
    mentions: z.array(commonSchemas.mongoId).optional(),
  }),
});

router.post(
  "/",
  validate(createCommentSchema),
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const { taskId, body, mentions } = req.validated.body;
      const userUid = req.user.uid;

      const user = await User.findOne({ uid: userUid });

      const comment = await Comment.create({
        taskId,
        body,
        authorId: user._id,
        mentions: mentions || [],
      });

      const populatedComment = await Comment.findById(comment._id)
        .populate("authorId", "name email avatarUrl")
        .populate("mentions", "name email avatarUrl");

      req.io.to(`task:${taskId}`).emit("comment:created", {
        comment: populatedComment,
      });

      res.status(201).json({
        success: true,
        data: populatedComment,
      });
    } catch (error) {
      console.error("💬 Create comment error:", error);
      res.status(500).json({
        message: "Failed to create comment",
      });
    }
  }
);

router.get(
  "/by-task/:taskId",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const { taskId } = req.params;

      const comments = await Comment.find({ taskId })
        .populate("authorId", "name email avatarUrl")
        .populate("mentions", "name email avatarUrl")
        .sort({ createdAt: 1 });

      res.json({
        success: true,
        data: comments,
      });
    } catch (error) {
      console.error("💬 Get comments error:", error);
      res.status(500).json({
        message: "Failed to fetch comments",
      });
    }
  }
);

module.exports = router;
