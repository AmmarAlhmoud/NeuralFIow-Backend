const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Project = require("../models/Project");
const Task = require("../models/Task");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");


const generateProjectKey = async (name, workspaceId) => {
  let baseKey = name
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 4)
    .toUpperCase();
  if (!baseKey) baseKey = "PRJ";

  // generate a short random suffix
  const randomSuffix = () =>
    crypto.randomBytes(2).toString("hex").toUpperCase();

  let key = `${baseKey}${randomSuffix()}`;
  let attempt = 0;

  // ensure uniqueness in workspace
  while (await Project.exists({ workspaceId, key })) {
    key = `${baseKey}${randomSuffix()}`;
    attempt++;
    if (attempt > 10) {
      // fallback using timestamp in rare case of multiple collisions
      key = `${baseKey}${Date.now().toString().slice(-4)}`;
      break;
    }
  }

  return key;
};

const createProjectSchema = z.object({
  body: z.object({
    workspaceId: commonSchemas.mongoId,
    name: z.string().min(1).max(100),
    key: z
      .string()
      .min(2)
      .max(10)
      .transform((val) => val.toUpperCase())
      .optional(),
    description: z.string().max(500).optional(),
  }),
});

const updateProjectSchema = z.object({
  params: z.object({
    projectId: commonSchemas.mongoId,
  }),
  body: z.object({
    workspaceId: commonSchemas.mongoId,
    name: z.string().min(1).max(100).optional(),
    key: z
      .string()
      .min(2)
      .max(10)
      .transform((val) => val.toUpperCase())
      .optional(),
    description: z.string().max(500).optional(),
    status: z.enum(["active", "archived", "completed"]).optional(),
  }),
});

const deletedProjectSchema = z.object({
  params: z.object({
    projectId: commonSchemas.mongoId,
  }),
  query: z.object({
    workspaceId: commonSchemas.mongoId,
  }),
});

router.post(
  "/",
  validate(createProjectSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const {
        workspaceId,
        name,
        key: providedKey,
        description,
      } = req.validated.body;

      // Ensure key is unique (use provided or generate)
      let key = providedKey;
      if (!key || (await Project.exists({ workspaceId, key }))) {
        key = await generateProjectKey(name, workspaceId);
      }

      const project = await Project.create({
        workspaceId,
        name,
        key,
        description,
        createdBy: req.dbUser._id,
      });

      res.status(201).json({
        success: true,
        data: project,
      });
    } catch (error) {
      console.error("📊 Create project error:", error);

      if (error.code === 11000) {
        return res.status(400).json({
          message: "Project key already exists in this workspace",
        });
      }

      res.status(500).json({
        message: "Failed to create project",
      });
    }
  }
);

router.patch(
  "/:projectId",
  validate(updateProjectSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { projectId } = req.validated.params;
      const {
        workspaceId,
        name,
        key: providedKey,
        description,
        status,
      } = req.validated.body;

      const currentProject = await Project.findById(projectId);

      if (!currentProject) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      if (currentProject.workspaceId.toString() !== workspaceId) {
        return res.status(403).json({
          message: "Project does not belong to this workspace",
        });
      }

      // Handle key update
      let key = providedKey || currentProject.key;

      // Only check for duplicates if key is being changed
      if (providedKey && providedKey !== currentProject.key) {
        const keyExists = await Project.exists({
          workspaceId,
          key: providedKey,
          _id: { $ne: projectId },
        });

        if (keyExists) {
          return res.status(400).json({
            message: "Project key already exists in this workspace",
          });
        }
      }

      // Build update object
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (key !== undefined) updateData.key = key;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;

      // Update and return the NEW document
      const project = await Project.findByIdAndUpdate(
        projectId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      console.error("📊 Update project error:", error);

      if (error.code === 11000) {
        return res.status(400).json({
          message: "Project key already exists in this workspace",
        });
      }

      res.status(500).json({
        message: "Failed to update project",
      });
    }
  }
);

router.delete(
  "/:projectId",
  validate(deletedProjectSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { projectId } = req.validated.params;
      const { workspaceId } = req.validated.query;

      const currentProject = await Project.findById(projectId);

      if (!currentProject) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      if (currentProject.workspaceId.toString() !== workspaceId) {
        return res.status(403).json({
          message: "Project does not belong to this workspace",
        });
      }

      // Delete all tasks associated with this project
      await Task.deleteMany({ projectId });

      // Delete the project
      await Project.findByIdAndDelete(projectId);

      res.status(204).json({
        status: "success",
        data: null,
      });
    } catch (error) {
      console.error("📊 Delete project error:", error);

      res.status(500).json({
        message: "Failed to delete project",
      });
    }
  }
);

router.get(
  "/by-workspace/:wid",
  requireWorkspaceRole("member"),
  async (req, res) => {
    try {
      const { wid } = req.params;

      const projects = await Project.find({ workspaceId: wid })
        .populate("createdBy", "name email avatarUrl")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: projects,
      });
    } catch (error) {
      console.error("📊 List projects error:", error);
      res.status(500).json({
        message: "Failed to fetch projects",
      });
    }
  }
);

module.exports = router;
