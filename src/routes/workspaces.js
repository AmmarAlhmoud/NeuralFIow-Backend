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
  requireWorkspaceRole("viewer"),
  async (req, res) => {
    try {
      const { _id } = req.dbUser;

      const id = req.validated.params.workspaceId;

      const workspace = await Workspace.findOne({
        _id: id,
        "members.uid": _id,
      })
        .populate("members.uid", "uid name email avatarURL position")
        .populate("ownerId", "name email avatarURL position")
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

const updateMemberSchema = z.object({
  body: z.object({
    _id: commonSchemas.mongoId.optional(),
    email: commonSchemas.email.optional(),
    role: commonSchemas.role.optional(),
  }),
  params: z.object({
    workspaceId: commonSchemas.mongoId,
    memberId: commonSchemas.mongoId,
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
        uid: user._id,
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

router.patch(
  "/:workspaceId/members/:memberId",
  validate(updateMemberSchema),
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { email, role } = req.validated.body;
      const { memberId } = req.validated.params;

      const workspace = req.workspace;
      const actingMembership = req.membership;
      const actingUserId = req.dbUser._id;

      // find target member
      const member =
        workspace.members.id?.(memberId) ||
        workspace.members.find((m) => m._id?.toString() === memberId);

      if (!member) {
        return res.status(404).json({ message: "Workspace member not found" });
      }

      const currentRole = member.role;
      const nextRole = role ?? currentRole;

      // 1) Only owner-admin can change roles at all
      const isActingOwner =
        workspace.ownerId.toString() === actingUserId.toString();
      const isActingAdmin = actingMembership.role === "admin";
      if (!(isActingOwner && isActingAdmin)) {
        return res
          .status(403)
          .json({ message: "Only the owner admin can change member roles" });
      }

      // 2) No self-role changes
      const isSelfTarget = member.uid.toString() === actingUserId.toString();
      if (isSelfTarget && (role || email)) {
        return res
          .status(403)
          .json({ message: "Users cannot change their own role or identity" });
      }

      // 3) Enforce single-admin: exactly one admin (the owner)
      const adminCount = workspace.members.filter(
        (m) => m.role === "admin"
      ).length;
      const isTargetOwner =
        workspace.ownerId.toString() === member.uid.toString();

      // If assigning admin to someone who isn't the owner reject req
      if (role === "admin" && !isTargetOwner) {
        return res
          .status(400)
          .json({ message: "Admin role is reserved for the workspace owner" });
      }

      // If target is owner-admin and attempting to set non-admin reject req
      if (isTargetOwner && role && role !== "admin") {
        return res
          .status(400)
          .json({ message: "Cannot demote the owner admin" });
      }

      // Prevent creating a second admin accidentally
      if (role === "admin" && adminCount >= 1 && !isTargetOwner) {
        return res
          .status(400)
          .json({ message: "Workspace already has an admin (the owner)" });
      }

      // 4) Update email uid if provided
      if (email) {
        const user = await User.findOne({ email });
        if (!user) {
          return res.status(404).json({
            message: "User with this email not found. They must sign up first.",
          });
        }

        // Prevent reassigning owner membership away from ownerId
        if (
          isTargetOwner &&
          user._id.toString() !== workspace.ownerId.toString()
        ) {
          return res
            .status(400)
            .json({ message: "Cannot change the owner’s membership identity" });
        }
        member.uid = user._id;
      }

      if (role) {
        member.role = role;
      }

      await workspace.save();

      res.status(200).json({
        success: true,
        data: { member },
      });
    } catch (error) {
      console.error("🏢 Update member error:", error);
      res.status(500).json({
        message: "Failed to update workspace member",
      });
    }
  }
);

router.delete(
  "/:workspaceId/members/:memberId",
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { workspaceId, memberId } = req.params;

      const workspace = req.workspace;
      const actingMembership = req.membership;
      const actingUserId = req.dbUser._id;

      // Only owner-admin can delete members
      const isActingOwner =
        workspace.ownerId.toString() === actingUserId.toString();
      const isActingAdmin = actingMembership.role === "admin";
      if (!(isActingOwner && isActingAdmin)) {
        return res
          .status(403)
          .json({ message: "Only the owner admin can remove members" });
      }

      // find the member
      const member =
        workspace.members.id?.(memberId) ||
        workspace.members.find((m) => m._id?.toString() === memberId);

      if (!member) {
        return res.status(404).json({ message: "Workspace member not found" });
      }

      // Prevent deleting self
      if (member.uid.toString() === actingUserId.toString()) {
        return res
          .status(403)
          .json({ message: "Admin cannot remove themselves" });
      }

      // Prevent deleting the owner membership
      const isTargetOwner =
        workspace.ownerId.toString() === member.uid.toString();
      if (isTargetOwner) {
        return res
          .status(403)
          .json({ message: "Cannot remove the workspace owner" });
      }

      // Remove the member
      if (workspace.members.id?.(memberId)) {
        workspace.members.id(memberId).deleteOne();
      } else {
        workspace.members = workspace.members.filter(
          (m) => m._id?.toString() !== memberId
        );
      }

      await workspace.save();

      return res.json({
        success: true,
        message: "Member removed from workspace",
      });
    } catch (error) {
      console.error("🏢 Remove member error:", error);
      return res
        .status(500)
        .json({ message: "Failed to remove workspace member" });
    }
  }
);

module.exports = router;
