const express = require("express");
const router = express.Router();
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");
const { positive } = require("zod/v4-mini");

const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
  }),
});

router.post("/", validate(createWorkspaceSchema), async (req, res) => {
  try {
    const { _id } = req.dbUser;
    const { name, description, color } = req.validated.body;

    const workspace = await Workspace.create({
      name,
      description,
      ownerId: _id,
      color,
      members: [
        {
          uid: _id,
          role: "admin",
          joinedAt: new Date(),
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error("🏢 Create workspace error:", error);
    res.status(500).json({
      message: "Failed to create workspace",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { _id } = req.dbUser;

    const workspaces = await Workspace.find({ "members.uid": _id })
      .populate("ownerId", "name email avatarURL")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    console.error("🏢 List workspaces error:", error);
    res.status(500).json({
      message: "Failed to fetch workspaces",
    });
  }
});

const getWorkspaceSchema = z.object({
  params: z.object({
    workspaceId: commonSchemas.mongoId,
  }),
});

router.get(
  "/:workspaceId",
  validate(getWorkspaceSchema),
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { _id } = req.dbUser;

      const id = req.validated.params.workspaceId;

      const workspace = await Workspace.findOne({
        _id: id,
        "members.uid": _id,
      })
        .populate("members.uid", "name email avatarURL position")
        .populate("ownerId", "name email avatarURL")
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      console.error("🏢 List workspace error:", error);
      res.status(500).json({
        message: "Failed to fetch workspace",
      });
    }
  }
);

const addMemberSchema = z.object({
  params: z.object({
    workspaceId: commonSchemas.mongoId,
  }),
  body: z.object({
    email: commonSchemas.email,
    role: commonSchemas.role.default("member"),
  }),
});

router.post(
  "/:workspaceId/members",
  validate(addMemberSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { email, role } = req.validated.body;
      const workspaceId = req.validated.params.workspaceId;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          message: "User not found. They must sign up first.",
        });
      }

      const workspace = await Workspace.findById(workspaceId);
      const existingMember = workspace.members.find(
        (m) => m.uid.toString() === user._id.toString()
      );

      if (existingMember) {
        return res.status(400).json({
          message: "User is already a workspace member",
        });
      }

      workspace.members.push({
        uid: user.uid,
        role,
        position: user.position,
        joinedAt: new Date(),
      });

      await workspace.save();

      req.io.to(`user:${user.uid}`).emit("workspace:invited", {
        workspace: { _id: workspace._id, name: workspace.name },
        role,
      });

      res.status(201).json({
        success: true,
        data: { member: { uid: user.uid, role, position: user.position } },
      });
    } catch (error) {
      console.error("🏢 Add member error:", error);
      res.status(500).json({
        message: "Failed to add workspace member",
      });
    }
  }
);

module.exports = router;
