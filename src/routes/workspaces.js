const express = require("express");
const router = express.Router();
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");

const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  }),
});

router.post("/", validate(createWorkspaceSchema), async (req, res) => {
  try {
    const { uid } = req.user;
    const { name, description } = req.validated.body;

    let user = await User.findOne({ uid });
    if (!user) {
      user = await User.create({
        uid,
        email: req.user.email,
        name: req.user.name,
        avatarUrl: req.user.picture,
      });
    }

    const workspace = await Workspace.create({
      name,
      description,
      ownerId: user._id,
      members: [
        {
          uid,
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
    const { uid } = req.user;

    const workspaces = await Workspace.find({ "members.uid": uid })
      .populate("ownerId", "name email avatarUrl")
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

const addMemberSchema = z.object({
  params: z.object({
    id: commonSchemas.mongoId,
  }),
  body: z.object({
    email: commonSchemas.email,
    role: commonSchemas.role.default("member"),
  }),
});

router.post(
  "/:id/members",
  validate(addMemberSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { email, role } = req.validated.body;
      const workspaceId = req.params.id;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          message: "User not found. They must sign up first.",
        });
      }

      const workspace = await Workspace.findById(workspaceId);
      const existingMember = workspace.members.find((m) => m.uid === user.uid);

      if (existingMember) {
        return res.status(400).json({
          message: "User is already a workspace member",
        });
      }

      workspace.members.push({
        uid: user.uid,
        role,
        joinedAt: new Date(),
      });

      await workspace.save();

      req.io.to(`user:${user.uid}`).emit("workspace:invited", {
        workspace: { _id: workspace._id, name: workspace.name },
        role,
      });

      res.status(201).json({
        success: true,
        data: { member: { uid: user.uid, role, user } },
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
