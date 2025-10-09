const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");
const { aiQueue } = require("../queues/ai-queue");

const createTaskSchema = z.object({
  body: z.object({
    projectId: commonSchemas.mongoId,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: commonSchemas.priority.optional(),
    status: commonSchemas.status.optional(),
    order: z.number().min(1).max(6).optional(),
    dueDate: z.string().nullable().optional(),
    estimate: z.number().positive().optional(),
    tags: z.array(z.string()).optional(),
    assignees: z.array(commonSchemas.mongoId).optional(),
  }),
});

router.post(
  "/",
  validate(createTaskSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const taskData = req.validated.body;

      // Default to 6 (last)
      let taskOrder = taskData.order ?? 6;

      if (taskOrder !== 6) {
        // Shift tasks at or after this order, but before "last"
        await Task.updateMany(
          {
            status: taskData.status,
            order: { $gte: taskOrder, $lt: 6 },
          },
          { $inc: { order: 1 } }
        );
      }

      const task = await Task.create({
        ...taskData,
        order: taskOrder,
        createdBy: req.dbUser._id,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      });

      const populatedTask = await Task.findById(task._id)
        .populate("createdBy", "name email avatarUrl")
        .populate("assignees", "_id name email avatarUrl");

      const assignees = populatedTask.assignees || [];

      for (const assignee of assignees) {
        const notification = new Notification({
          userId: assignee._id,
          type: "task_assigned",
          title: "Task Assigned",
          message: `Task "${populatedTask.title}" was assigned by ${req.dbUser.name}.`,
          payload: {
            taskId: populatedTask._id,
            projectId: populatedTask.projectId,
            workspaceId: populatedTask.workspaceId,
            actorId: req.dbUser._id,
          },
        });
        await notification.save();
      }

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
        .populate("createdBy", "_id name email avatarURL")
        .populate("assignees", "_id name email avatarURL")
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
    dueDate: z.string().nullable().optional(),
    estimate: z.number().positive().optional(),
    order: z.number().min(1).max(6).optional(),
    tags: z.array(z.string()).optional(),
    assignees: z.array(commonSchemas.mongoId).optional(),
  }),
});

const deleteTaskSchema = z.object({
  params: z.object({
    id: commonSchemas.mongoId,
  }),
});

router.patch(
  "/:id",
  validate(updateTaskSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const updates = req.validated.body;

      if (updates.dueDate) {
        updates.dueDate = new Date(updates.dueDate);
      }

      // Get the current task first
      const task = await Task.findById(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const oldOrder = task.order;
      const newOrder = updates.order;

      if (newOrder !== undefined && newOrder !== oldOrder) {
        const status = updates.status ?? task.status;

        if (newOrder === 6) {
          // Moving to last decrement orders above oldOrder
          await Task.updateMany(
            {
              status,
              order: { $gt: oldOrder, $lt: 6 },
              _id: { $ne: task._id },
            },
            { $inc: { order: -1 } }
          );
        } else if (oldOrder === 6) {
          // Moving from last increment orders >= newOrder
          await Task.updateMany(
            {
              status,
              order: { $gte: newOrder, $lt: 6 },
              _id: { $ne: task._id },
            },
            { $inc: { order: 1 } }
          );
        } else if (newOrder > oldOrder) {
          // Moving down
          await Task.updateMany(
            {
              status,
              order: { $gt: oldOrder, $lt: newOrder },
              _id: { $ne: task._id },
            },
            { $inc: { order: -1 } }
          );
        } else {
          // Moving up
          await Task.updateMany(
            {
              status,
              order: { $gte: newOrder, $lt: oldOrder },
              _id: { $ne: task._id },
            },
            { $inc: { order: 1 } }
          );
        }

        // req.io.to(`project:${task.projectId}`).emit("task:moved", {
        //   taskId: task._id,
        //   oldOrder,
        //   newOrder,
        //   status,
        // });
      }

      const updatedTask = await Task.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      })
        .populate("createdBy", "name email avatarUrl")
        .populate("assignees", "_id name email avatarUrl");

      const assignees = updatedTask.assignees || [];

      for (const assignee of assignees) {
        const notification = new Notification({
          userId: assignee._id,
          type: "task_updated",
          title: "Task Updated",
          message: `Task "${updatedTask.title}" was updated by ${req.dbUser.name}.`,
          payload: {
            taskId: updatedTask._id,
            projectId: updatedTask.projectId,
            workspaceId: updatedTask.workspaceId,
            actorId: req.dbUser._id,
          },
        });
        await notification.save();
      }

      res.status(200).json({
        success: true,
        data: updatedTask,
      });
    } catch (error) {
      console.error("📝 Update task error:", error);
      res.status(500).json({
        message: "Failed to update task",
      });
    }
  }
);

router.delete(
  "/:id",
  validate(deleteTaskSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const taskId = req.validated.params.id;

      const task = await Task.findByIdAndDelete({ _id: taskId });

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
        });
      }

      const assignees = task.assignees || [];
      for (const assignee of assignees) {
        const notification = new Notification({
          userId: assignee._id,
          type: "task_deleted",
          title: "Task Deleted",
          message: `Task "${task.title}" was deleted by ${req.dbUser.name}.`,
          payload: {
            taskId: task._id,
            projectId: task.projectId,
            workspaceId: task.workspaceId,
            actorId: req.dbUser._id,
          },
        });
        await notification.save();
      }

      res.status(204).json({
        success: true,
        data: null,
      });
    } catch (error) {
      console.error("📝 Delete task error:", error);
      res.status(500).json({
        message: "Failed to delete task",
      });
    }
  }
);

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
