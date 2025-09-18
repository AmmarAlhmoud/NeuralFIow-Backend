const express = require("express");
const router = express.Router();
const List = require("../models/List");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");

const createListSchema = z.object({
  body: z.object({
    projectId: commonSchemas.mongoId,
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    order: z.number().int().min(0).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
  }),
});

router.post(
  "/",
  validate(createListSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { projectId, name, description, order, color } = req.validated.body;

      const list = await List.create({
        projectId,
        name,
        description,
        order: order ?? 0,
        color: color ?? "#6366f1",
      });

      req.io.to(`project:${projectId}`).emit("list:created", {
        list,
        projectId,
      });

      res.status(201).json({
        success: true,
        data: list,
      });
    } catch (error) {
      console.error("📋 Create list error:", error);
      res.status(500).json({
        message: "Failed to create list",
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

      const lists = await List.find({ projectId }).sort({
        order: 1,
        createdAt: 1,
      });

      res.json({
        success: true,
        data: lists,
      });
    } catch (error) {
      console.error("📋 Get lists error:", error);
      res.status(500).json({
        message: "Failed to fetch lists",
      });
    }
  }
);

const updateListSchema = z.object({
  params: z.object({
    id: commonSchemas.mongoId,
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    order: z.number().int().min(0).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
  }),
});

router.patch(
  "/:id",
  validate(updateListSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const updates = req.validated.body;

      const list = await List.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      });

      if (!list) {
        return res.status(404).json({
          message: "List not found",
        });
      }

      req.io.to(`project:${list.projectId}`).emit("list:updated", {
        list,
        changes: updates,
      });

      res.json({
        success: true,
        data: list,
      });
    } catch (error) {
      console.error("📋 Update list error:", error);
      res.status(500).json({
        message: "Failed to update list",
      });
    }
  }
);

module.exports = router;
