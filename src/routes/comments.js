const express = require("express");
const router = express.Router();
const Comment = require("../models/Comment");
const User = require("../models/User");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
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

      const comment = await Comment.create({
        taskId,
        body,
        authorId: req.dbUser._id,
        mentions: mentions || [],
      });

      const populatedComment = await Comment.findById(comment._id)
        .populate("authorId", "_id name email avatarUrl")
        .populate("mentions", "_id name email avatarUrl");

      const task = await Task.findById({ _id: taskId })
        .populate("createdBy", "_id name email avatarUrl")
        .populate("assignees", "_id name email avatarUrl");

      const assignees = task.assignees || [];
      let notification;

      for (const assignee of assignees) {
        if (assignee._id.toString() !== req.dbUser._id.toString()) {
          notification = new Notification({
            userId: assignee._id,
            type: "new_comment",
            title: "New Comment",
            message: `New comment on "${task.title}" task was added by ${req.dbUser.name}.`,
            payload: {
              taskId: task._id,
              projectId: task.projectId,
              workspaceId: task.workspaceId,
              actorId: req.dbUser._id,
            },
          });
        }
        await notification.save();
      }

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
        .populate("authorId", "_id name email avatarUrl")
        .populate("mentions", "_id name email avatarUrl")
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
