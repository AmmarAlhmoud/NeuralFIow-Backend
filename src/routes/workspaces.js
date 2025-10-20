const express = require("express");
const router = express.Router();
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const Invite = require("../models/Invite");
const Notification = require("../models/Notification");
const { requireWorkspaceRole } = require("../middleware/rbac");
const { validate, z, commonSchemas } = require("../middleware/validate");

const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
  }),
});

const updateWorkspaceSettingsSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    timezone: z.string().optional(),
    aiModel: z.string().optional(),
    allowInvites: z.boolean().optional(),
  }),
  params: z.object({
    workspaceId: commonSchemas.mongoId,
  }),
});

const deleteWorkspaceSchema = z.object({
  params: z.object({
    workspaceId: commonSchemas.mongoId,
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

router.patch(
  "/:workspaceId",
  validate(updateWorkspaceSettingsSchema),
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { workspaceId } = req.validated.params;
      const { name, timezone, aiModel, allowInvites } = req.validated.body;

      const workspace = await Workspace.findOneAndUpdate(
        { _id: workspaceId },
        {
          name,
          settings: {
            aiModel,
            timezone,
            allowInvites,
          },
        }
      );

      res.status(200).json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      console.error("🏢 update workspace settings error:", error);
      res.status(500).json({
        message: "Failed to update workspace settings",
      });
    }
  }
);

router.delete(
  "/:workspaceId",
  validate(deleteWorkspaceSchema),
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { workspaceId } = req.validated.params;

      await Workspace.findByIdAndDelete({ _id: workspaceId });

      res.status(204).json({
        success: true,
        data: null,
      });
    } catch (error) {
      console.error("🏢 delete workspace error:", error);
      res.status(500).json({
        message: "Failed to delete workspace",
      });
    }
  }
);

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
        .populate(
          "members.uid",
          "_id uid name email avatarURL position isOnline"
        )
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

const deleteMemberSchema = z.object({
  params: z.object({
    workspaceId: commonSchemas.mongoId,
    memberId: commonSchemas.mongoId,
  }),
});

const inviteMemberSchema = z.object({
  params: z.object({
    workspaceId: commonSchemas.mongoId,
    inviteId: commonSchemas.mongoId,
  }),
});

router.post(
  "/:workspaceId/members/invite",
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

      const existingInvite = await Invite.findOne({
        workspaceId,
        userId: user._id,
      });

      if (existingMember) {
        return res.status(400).json({
          message: "User is already a workspace member",
        });
      }

      if (existingInvite) {
        return res.status(400).json({
          message: "User already has a pending invite",
        });
      }

      const invite = new Invite({
        workspaceId,
        userId: user._id,
        role,
        invitedBy: req.dbUser._id,
        createdAt: new Date(),
      });
      await invite.save();

      const notification = new Notification({
        userId: user._id,
        type: "membership_invite",
        title: "Membership Invite",
        message: `You have been invited to "${workspace.name}" workspace by ${req.dbUser.name}.`,
        payload: {
          workspaceId,
          actorId: req.dbUser._id,
          inviteId: invite._id,
        },
      });
      await notification.save();

      res.status(200).json({
        success: true,
        message: "Membership invite sent",
      });
    } catch (error) {
      console.error("🏢 Invite member error:", error);
      res.status(500).json({
        message: "Failed to send workspace membership invite",
      });
    }
  }
);

router.post(
  "/:workspaceId/members/accept-invite/:inviteId",
  validate(inviteMemberSchema),
  async (req, res) => {
    try {
      const { workspaceId, inviteId } = req.validated.params;
      const userId = req.dbUser._id;

      const invite = await Invite.findOne({
        _id: inviteId,
        workspaceId,
        userId,
      });

      if (!invite) {
        return res.status(404).json({
          message: "Invite not found or already accepted/declined.",
        });
      }

      const workspace = await Workspace.findById(workspaceId);

      // Check if user is already a member
      const existingMember = workspace.members.find(
        (m) => m.uid.toString() === userId.toString()
      );

      if (existingMember) {
        return res.status(400).json({
          message: "User is already a workspace member",
        });
      }

      workspace.members.push({
        uid: userId,
        role: invite.role,
        joinedAt: new Date(),
      });
      await workspace.save();

      await Invite.deleteOne({ _id: inviteId });
      await Notification.updateOne(
        { "payload.inviteId": inviteId },
        { $set: { read: true } }
      );

      const notification = new Notification({
        userId: workspace.ownerId,
        type: "membership_invite_status",
        title: "Membership Invite Accepted",
        message: `Your invite to ${req.dbUser.name} to join "${workspace.name}" workspace has been accepted.`,
        payload: {
          workspaceId,
          actorId: req.dbUser._id,
        },
      });
      await notification.save();

      res.status(200).json({
        success: true,
        data: {
          member: {
            uid: userId,
            role: invite.role,
          },
        },
      });
    } catch (error) {
      console.error("🏢 Accept invite error:", error);
      res.status(500).json({
        message: "Failed to accept workspace membership invite",
      });
    }
  }
);

router.post(
  "/:workspaceId/members/decline-invite/:inviteId",
  validate(inviteMemberSchema),
  async (req, res) => {
    try {
      const { workspaceId, inviteId } = req.validated.params;
      const userId = req.dbUser._id;

      const invite = await Invite.findOne({
        _id: inviteId,
        workspaceId,
        userId,
      });

      if (!invite) {
        return res.status(404).json({
          message: "Invite not found or already processed.",
        });
      }

      await Invite.deleteOne({ _id: inviteId });
      await Notification.updateOne(
        { "payload.inviteId": inviteId },
        { $set: { read: true } }
      );

      const workspace = await Workspace.findById(workspaceId).lean();

      const notification = new Notification({
        userId: workspace.ownerId,
        type: "membership_invite_status",
        title: "Membership Invite Declined",
        message: `Your invite to ${req.dbUser.name} to join "${workspace.name}" workspace has been declined.`,
        payload: {
          workspaceId,
          actorId: req.dbUser._id,
        },
      });
      await notification.save();

      res.status(200).json({
        success: true,
        message: "Invite declined and removed successfully.",
      });
    } catch (error) {
      console.error("🏢 Declining invite error:", error);
      res.status(500).json({
        message: "Failed to decline workspace membership invite",
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
      const { memberId, workspaceId } = req.validated.params;

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

      const previousRole = member.role;
      if (role) {
        member.role = role;
      }

      await workspace.save();

      let message;

      if (role === "manager" && previousRole !== "manager") {
        message = `Your role in "${workspace.name}" workspace was promoted by ${req.dbUser.name} to manager.`;
      } else if (role === "member" && previousRole === "manager") {
        message = `Your role in "${workspace.name}" workspace was demoted by ${req.dbUser.name} to member.`;
      } else if (role === "viewer" && previousRole === "member") {
        message = `Your role in "${workspace.name}" workspace was demoted by ${req.dbUser.name} to viewer.`;
      } else if (role === "member" && previousRole === "viewer") {
        message = `Your role in "${workspace.name}" workspace was promoted by ${req.dbUser.name} to member.`;
      } else if (role === "manager" && previousRole === "viewer") {
        message = `Your role in "${workspace.name}" workspace was promoted by ${req.dbUser.name} to manager.`;
      } else if (role === "viewer" && previousRole === "manager") {
        message = `Your role in "${workspace.name}" workspace was demoted by ${req.dbUser.name} to viewer.`;
      } else {
        message = `Your role in "${workspace.name}" workspace was changed by ${req.dbUser.name}.`;
      }

      const notification = new Notification({
        userId: member.uid,
        type: "role_updated",
        title: "Role Updated",
        message,
        payload: {
          workspaceId,
          actorId: req.dbUser._id,
        },
      });
      await notification.save();

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
  validate(deleteMemberSchema),
  requireWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { memberId } = req.validated.params;

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

      const notification = new Notification({
        userId: member.uid,
        type: "membership_removed",
        title: "Membership Removed",
        message: `Your membership in "${workspace.name}" workspace was removed by ${req.dbUser.name}.`,
        payload: {
          workspaceId: workspace.workspaceId,
          actorId: req.dbUser._id,
        },
      });
      await notification.save();

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
