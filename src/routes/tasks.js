const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const User = require("../models/User");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");
const { aiQueue } = require("../queues/ai-queue");

const createTaskSchema = z.object({
  body: z.object({
    projectId: commonSchemas.mongoId,
    listId: commonSchemas.mongoId,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: commonSchemas.priority.optional(),
    dueDate: z.string().datetime().optional(),
    estimate: z.number().positive().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(commonSchemas.mongoId).optional(),
  }),
});

router.post(
  "/",
  validate(createTaskSchema),
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const taskData = req.validated.body;
      const userUid = req.user.uid;

      const user = await User.findOne({ uid: userUid });

      const task = await Task.create({
        ...taskData,
        createdBy: user._id,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      });

      const populatedTask = await Task.findById(task._id)
        .populate("createdBy", "name email avatarUrl")
        .populate("assignees", "name email avatarUrl");

      req.io.to(`project:${task.projectId}`).emit("task:created", {
        task: populatedTask,
      });

      res.status(201).json({
        success: true,
        data: populatedTask,
      });
    } catch (error) {
      console.error("📝 Create task error:", error);
      res.status(500).json({
        message: "Failed to create task",
      });
    }
  }
);

router.get(
  "/by-project/:projectId",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const { projectId } = req.params;

      const tasks = await Task.find({ projectId })
        .populate("createdBy", "name email avatarUrl")
        .populate("assignees", "name email avatarUrl")
        .sort({ order: 1, createdAt: -1 });

      res.json({
        success: true,
        data: tasks,
      });
    } catch (error) {
      console.error("📝 Get tasks error:", error);
      res.status(500).json({
        message: "Failed to fetch tasks",
      });
    }
  }
);

const updateTaskSchema = z.object({
  params: z.object({
    id: commonSchemas.mongoId,
  }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    priority: commonSchemas.priority.optional(),
    status: commonSchemas.status.optional(),
    dueDate: z.string().datetime().optional(),
    estimate: z.number().positive().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(commonSchemas.mongoId).optional(),
  }),
});

router.patch(
  "/:id",
  validate(updateTaskSchema),
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const updates = req.validated.body;
      if (updates.dueDate) {
        updates.dueDate = new Date(updates.dueDate);
      }

      const task = await Task.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      })
        .populate("createdBy", "name email avatarUrl")
        .populate("assignees", "name email avatarUrl");

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
        });
      }

      req.io.to(`project:${task.projectId}`).emit("task:updated", {
        task,
        changes: updates,
      });

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      console.error("📝 Update task error:", error);
      res.status(500).json({
        message: "Failed to update task",
      });
    }
  }
);

router.patch("/:id/move", requireWorkspaceRole("member"), async (req, res) => {
  try {
    const { listId, order } = req.body;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        listId,
        ...(order !== undefined && { order }),
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    req.io.to(`project:${task.projectId}`).emit("task:moved", {
      taskId: task._id,
      listId,
      order,
    });

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("📝 Move task error:", error);
    res.status(500).json({
      message: "Failed to move task",
    });
  }
});

// AI endpoints
router.post(
  "/:id/ai/summarize",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      await aiQueue.add("summary", { taskId: req.params.id });
      res.json({
        success: true,
        message: "AI summarization queued",
      });
    } catch (error) {
      console.error("🤖 AI summarize error:", error);
      res.status(500).json({
        message: "Failed to queue AI summarization",
      });
    }
  }
);

router.post(
  "/:id/ai/subtasks",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      await aiQueue.add("subtasks", { taskId: req.params.id });
      res.json({
        success: true,
        message: "AI subtask generation queued",
      });
    } catch (error) {
      console.error("🤖 AI subtasks error:", error);
      res.status(500).json({
        message: "Failed to queue AI subtask generation",
      });
    }
  }
);

router.post(
  "/:id/ai/priority",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      await aiQueue.add("priority", { taskId: req.params.id });
      res.json({
        success: true,
        message: "AI priority suggestion queued",
      });
    } catch (error) {
      console.error("🤖 AI priority error:", error);
      res.status(500).json({
        message: "Failed to queue AI priority suggestion",
      });
    }
  }
);

module.exports = router;
