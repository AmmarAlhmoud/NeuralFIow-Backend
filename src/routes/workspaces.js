const express = require("express");
const router = express.Router();
const Workspace = require("../models/Workspace");
const Project = require("../models/Project");
const Task = require("../models/Task");
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

const getWorkspacesSchema = z.object({
  query: z.object({
    search: z.string().optional(),
  }),
});

const getAIStatusSchema = z.object({
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

router.get("/", validate(getWorkspacesSchema), async (req, res) => {
  try {
    const { _id } = req.dbUser;
    const search = req.validated.query.search;

    let queryObj = {
      "members.uid": _id,
    };

    // Build base query
    let query = Workspace.find(queryObj);

    // If search exists
    if (typeof search === "string" && search.trim() !== "") {
      queryObj = {
        ...queryObj,
        name: { $regex: search, $options: "i" },
      };

      // Select only specific fields for search results
      query = Workspace.find(queryObj)
        .select("_id name members.uid createdAt")
        .populate("ownerId", "name email avatarURL");
    } else {
      query = Workspace.find(queryObj).populate(
        "ownerId",
        "name email avatarURL"
      );
    }

    const workspaces = await query.sort({ createdAt: -1 });

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

router.get(
  "/:workspaceId/ai-stats",
  validate(getAIStatusSchema),
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { workspaceId } = req.validated.params;
      const now = Date.now();
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

      // Get all projects in workspace
      const projects = await Project.find({ workspaceId }).select(
        "_id status createdAt"
      );
      const projectIds = projects.map((p) => p._id);

      // 1. ACTIVE PROJECTS TRACKING
      const activeProjectsCount = projects.filter(
        (p) => p.status === "active"
      ).length;

      const activeProjectsThisWeek = await Project.countDocuments({
        workspaceId,
        status: "active",
        createdAt: { $gte: oneWeekAgo },
      });

      const activeProjectsLastWeek = await Project.countDocuments({
        workspaceId,
        status: "active",
        createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
      });

      const activeProjectsChange =
        activeProjectsLastWeek > 0
          ? ((activeProjectsThisWeek - activeProjectsLastWeek) /
              activeProjectsLastWeek) *
            100
          : activeProjectsThisWeek > 0
          ? 100
          : 0;

      // 2. TEAM MEMBERS TRACKING

      // Get the workspace with all members
      const workspace = await Workspace.findById(workspaceId).select("members");

      if (!workspace) {
        return res.status(404).json({
          success: false,
          message: "Workspace not found",
        });
      }

      // Total members count
      const allMembers = workspace.members.length;

      // Members who joined this week
      const membersThisWeek = workspace.members.filter(
        (member) => new Date(member.joinedAt) >= oneWeekAgo
      ).length;

      // Members who joined last week
      const membersLastWeek = workspace.members.filter((member) => {
        const joinedAt = new Date(member.joinedAt);
        return joinedAt >= twoWeeksAgo && joinedAt < oneWeekAgo;
      }).length;

      const membersChange =
        membersLastWeek > 0
          ? ((membersThisWeek - membersLastWeek) / membersLastWeek) * 100
          : membersThisWeek > 0
          ? 100
          : 0;

      // 3. SUBTASKS GENERATED

      // Total subtasks
      const subtasksAllTime = await Task.aggregate([
        {
          $match: {
            projectId: { $in: projectIds },
            "ai.suggestedSubtasks": { $exists: true, $ne: [] },
          },
        },
        { $unwind: "$ai.suggestedSubtasks" },
        { $count: "total" },
      ]);

      // Subtasks this week
      const subtasksThisWeek = await Task.aggregate([
        {
          $match: {
            projectId: { $in: projectIds },
            "ai.suggestedSubtasks": { $exists: true, $ne: [] },
            "ai.lastProcessed": { $gte: oneWeekAgo },
          },
        },
        { $unwind: "$ai.suggestedSubtasks" },
        { $count: "total" },
      ]);

      // Subtasks last week
      const subtasksLastWeek = await Task.aggregate([
        {
          $match: {
            projectId: { $in: projectIds },
            "ai.suggestedSubtasks": { $exists: true, $ne: [] },
            "ai.lastProcessed": { $gte: twoWeeksAgo, $lt: oneWeekAgo },
          },
        },
        { $unwind: "$ai.suggestedSubtasks" },
        { $count: "total" },
      ]);

      const subtasksTotalAllTime = subtasksAllTime[0]?.total || 0;
      const subtasksThisWeekCount = subtasksThisWeek[0]?.total || 0;
      const subtasksLastWeekCount = subtasksLastWeek[0]?.total || 0;
      const subtasksChange =
        subtasksLastWeekCount > 0
          ? ((subtasksThisWeekCount - subtasksLastWeekCount) /
              subtasksLastWeekCount) *
            100
          : 0;

      // 4. HOURS SAVED

      const TIME_SAVED_PER_ACTION = {
        summary: 0.25, // 15 minutes
        subtasks: 0.5, // 30 minutes
        priority: 0.08, // 5 minutes
      };

      // Calculate hours saved this week
      const tasksThisWeek = await Task.find({
        projectId: { $in: projectIds },
        "ai.lastProcessed": { $gte: oneWeekAgo },
      });

      let hoursSavedThisWeek = 0;
      tasksThisWeek.forEach((task) => {
        if (task.ai?.summary)
          hoursSavedThisWeek += TIME_SAVED_PER_ACTION.summary;
        if (task.ai?.suggestedSubtasks?.length > 0)
          hoursSavedThisWeek += TIME_SAVED_PER_ACTION.subtasks;
        if (task.ai?.suggestedPriority)
          hoursSavedThisWeek += TIME_SAVED_PER_ACTION.priority;
      });

      // Calculate hours saved last week
      const tasksLastWeek = await Task.find({
        projectId: { $in: projectIds },
        "ai.lastProcessed": { $gte: twoWeeksAgo, $lt: oneWeekAgo },
      });

      let hoursSavedLastWeek = 0;
      tasksLastWeek.forEach((task) => {
        if (task.ai?.summary)
          hoursSavedLastWeek += TIME_SAVED_PER_ACTION.summary;
        if (task.ai?.suggestedSubtasks?.length > 0)
          hoursSavedLastWeek += TIME_SAVED_PER_ACTION.subtasks;
        if (task.ai?.suggestedPriority)
          hoursSavedLastWeek += TIME_SAVED_PER_ACTION.priority;
      });

      // Total hours saved (all time)
      const allAITasks = await Task.find({
        projectId: { $in: projectIds },
        ai: { $exists: true },
      });

      let totalHoursSaved = 0;
      allAITasks.forEach((task) => {
        if (task.ai?.summary) totalHoursSaved += TIME_SAVED_PER_ACTION.summary;
        if (task.ai?.suggestedSubtasks?.length > 0)
          totalHoursSaved += TIME_SAVED_PER_ACTION.subtasks;
        if (task.ai?.suggestedPriority)
          totalHoursSaved += TIME_SAVED_PER_ACTION.priority;
      });

      const hoursSavedChange =
        hoursSavedLastWeek > 0
          ? ((hoursSavedThisWeek - hoursSavedLastWeek) / hoursSavedLastWeek) *
            100
          : 0;

      // 5. AI ACCURACY

      const tasksWithAI = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
      });

      const completedTasksWithAI = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        status: "done",
      });

      const accuracyRate =
        tasksWithAI > 0 ? (completedTasksWithAI / tasksWithAI) * 100 : 0;

      // Calculate accuracy change (this week vs last week)
      const tasksWithAIThisWeek = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        createdAt: { $gte: oneWeekAgo },
      });

      const completedAITasksThisWeek = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        status: "done",
        createdAt: { $gte: oneWeekAgo },
      });

      const accuracyThisWeek =
        tasksWithAIThisWeek > 0
          ? (completedAITasksThisWeek / tasksWithAIThisWeek) * 100
          : 0;

      const tasksWithAILastWeek = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
      });

      const completedAITasksLastWeek = await Task.countDocuments({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        status: "done",
        createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
      });

      const accuracyLastWeek =
        tasksWithAILastWeek > 0
          ? (completedAITasksLastWeek / tasksWithAILastWeek) * 100
          : 0;

      const accuracyChange =
        accuracyLastWeek > 0 ? accuracyThisWeek - accuracyLastWeek : 0;

      // 6. TOTAL AUTOMATIONS & EFFICIENCY

      const totalAutomations = await Task.countDocuments({
        projectId: { $in: projectIds },
        $or: [
          { "ai.summary": { $exists: true } },
          { "ai.suggestedSubtasks": { $exists: true } },
          { "ai.suggestedPriority": { $exists: true } },
        ],
      });

      // Calculate efficiency boost
      const tasksWithAICompleted = await Task.find({
        projectId: { $in: projectIds },
        ai: { $exists: true },
        status: "done",
      }).select("createdAt updatedAt");

      let totalTimeWithAI = 0;
      tasksWithAICompleted.forEach((task) => {
        const timeTaken =
          new Date(task.updatedAt).getTime() -
          new Date(task.createdAt).getTime();
        totalTimeWithAI += timeTaken;
      });
      const avgTimeWithAI =
        tasksWithAICompleted.length > 0
          ? totalTimeWithAI / tasksWithAICompleted.length
          : 0;

      const tasksWithoutAICompleted = await Task.find({
        projectId: { $in: projectIds },
        ai: { $exists: false },
        status: "done",
      }).select("createdAt updatedAt");

      let totalTimeWithoutAI = 0;
      tasksWithoutAICompleted.forEach((task) => {
        const timeTaken =
          new Date(task.updatedAt).getTime() -
          new Date(task.createdAt).getTime();
        totalTimeWithoutAI += timeTaken;
      });
      const avgTimeWithoutAI =
        tasksWithoutAICompleted.length > 0
          ? totalTimeWithoutAI / tasksWithoutAICompleted.length
          : 0;

      const efficiencyBoost =
        avgTimeWithoutAI > 0 && avgTimeWithAI > 0
          ? ((avgTimeWithoutAI - avgTimeWithAI) / avgTimeWithoutAI) * 100
          : 0;

      // 7. COMPLETION RATE

      const completionStats = await Task.aggregate([
        { $match: { projectId: { $in: projectIds }, ai: { $exists: true } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] },
            },
          },
        },
      ]);

      const completionRate = completionStats[0]
        ? (completionStats[0].completed / completionStats[0].total) * 100
        : 0;

      // 8. BREAKDOWN BY AI TYPE

      const aiBreakdown = await Task.aggregate([
        { $match: { projectId: { $in: projectIds }, ai: { $exists: true } } },
        {
          $group: {
            _id: null,
            summariesGenerated: {
              $sum: { $cond: [{ $ifNull: ["$ai.summary", false] }, 1, 0] },
            },
            prioritiesAnalyzed: {
              $sum: {
                $cond: [{ $ifNull: ["$ai.suggestedPriority", false] }, 1, 0],
              },
            },
            subtasksCreated: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      { $size: { $ifNull: ["$ai.suggestedSubtasks", []] } },
                      0,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const breakdown = aiBreakdown[0] || {
        summariesGenerated: 0,
        prioritiesAnalyzed: 0,
        subtasksCreated: 0,
      };

      // RESPONSE

      res.json({
        success: true,
        data: {
          activeProjects: {
            total: activeProjectsCount,
            thisWeek: activeProjectsThisWeek,
            change: Number(activeProjectsChange.toFixed(1)),
          },
          teamMembers: {
            total: allMembers,
            thisWeek: membersThisWeek,
            change: Number(membersChange.toFixed(1)),
          },
          subtasksGenerated: {
            total: subtasksTotalAllTime,
            thisWeek: subtasksThisWeekCount,
            change: Number(subtasksChange.toFixed(1)),
          },
          hoursSaved: {
            total: Math.round(totalHoursSaved),
            thisWeek: Math.round(hoursSavedThisWeek),
            change: Number(hoursSavedChange.toFixed(1)),
          },
          aiAccuracy: {
            rate: Number(accuracyRate.toFixed(1)),
            change: Number(accuracyChange.toFixed(1)),
          },
          automations: {
            total: totalAutomations,
            efficiencyBoost: Number(efficiencyBoost.toFixed(1)),
          },
          completionRate: Number(completionRate.toFixed(1)),
          breakdown: {
            summaries: breakdown.summariesGenerated,
            priorities: breakdown.prioritiesAnalyzed,
            subtasks: breakdown.subtasksCreated,
          },
        },
      });
    } catch (error) {
      console.error("📊 AI Stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch AI statistics",
      });
    }
  }
);

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
        currentUser: req.dbUser,
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
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { email, role } = req.validated.body;
      const { memberId, workspaceId } = req.validated.params;

      const workspace = req.workspace;
      const actingMembership = req.membership;
      const actingUserId = req.dbUser._id;
      const actingUserRole = actingMembership.role;

      // Find target member
      const member =
        workspace.members.id?.(memberId) ||
        workspace.members.find((m) => m._id?.toString() === memberId);

      if (!member) {
        return res.status(404).json({ message: "Workspace member not found" });
      }

      const targetMemberRole = member.role;
      const isTargetOwner =
        workspace.ownerId.toString() === member.uid.toString();

      // Role hierarchy
      const ROLE_HIERARCHY = {
        admin: 4,
        manager: 3,
        member: 2,
        viewer: 1,
      };

      // Track what was updated for response message
      let updates = [];

      // 1) No self-changes (role or email)
      const isSelfTarget = member.uid.toString() === actingUserId.toString();
      if (isSelfTarget && (role || email)) {
        return res.status(403).json({
          message: "Users cannot change their own role or email",
        });
      }

      // 2) Cannot change owner's role or email
      if (isTargetOwner) {
        if (role && role !== "admin") {
          return res.status(400).json({
            message: "Cannot demote the workspace owner",
          });
        }
        if (email) {
          return res.status(400).json({
            message: "Cannot change the workspace owner's email",
          });
        }
      }

      // 3) Admin role is reserved for owner only
      if (role === "admin" && !isTargetOwner) {
        return res.status(400).json({
          message: "Admin role is reserved for the workspace owner",
        });
      }

      // 4) ROLE CHANGE Logic - Check if role actually changed
      if (role && role !== targetMemberRole) {
        // Permission checks for managers
        if (actingUserRole === "manager") {
          // Managers CANNOT change roles of other managers or admins
          if (ROLE_HIERARCHY[targetMemberRole] >= ROLE_HIERARCHY.manager) {
            return res.status(403).json({
              message:
                "Managers cannot change roles of other managers or admins",
            });
          }

          // Managers CANNOT promote to manager or admin
          if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager) {
            return res.status(403).json({
              message:
                "Managers cannot promote users to manager or admin roles. Only admins can do this.",
            });
          }

          // Managers CAN only change member/viewer
          if (!["member", "viewer"].includes(role)) {
            return res.status(403).json({
              message: "Managers can only assign member or viewer roles",
            });
          }
        }

        // Update role
        const previousRole = member.role;
        member.role = role;
        updates.push("role");

        // Generate notification message
        let message;
        const actorName = req.dbUser.name;
        const workspaceName = workspace.name;

        if (role === "manager" && previousRole !== "manager") {
          message = `Your role in "${workspaceName}" workspace was promoted by ${actorName} to manager.`;
        } else if (role === "member" && previousRole === "manager") {
          message = `Your role in "${workspaceName}" workspace was changed by ${actorName} to member.`;
        } else if (role === "viewer" && previousRole === "member") {
          message = `Your role in "${workspaceName}" workspace was changed by ${actorName} to viewer.`;
        } else if (role === "member" && previousRole === "viewer") {
          message = `Your role in "${workspaceName}" workspace was promoted by ${actorName} to member.`;
        } else if (role === "manager" && previousRole === "viewer") {
          message = `Your role in "${workspaceName}" workspace was promoted by ${actorName} to manager.`;
        } else if (role === "viewer" && previousRole === "manager") {
          message = `Your role in "${workspaceName}" workspace was changed by ${actorName} to viewer.`;
        } else {
          message = `Your role in "${workspaceName}" workspace was changed by ${actorName} from ${previousRole} to ${role}.`;
        }

        const notification = new Notification({
          userId: member.uid,
          type: "role_updated",
          title: "Role Updated",
          message,
          payload: {
            workspaceId,
            actorId: req.dbUser._id,
            previousRole,
            newRole: role,
          },
        });
        await notification.save();
      } else if (role && role === targetMemberRole) {
      }

      // 5) EMAIL CHANGE Logic
      let emailChanged = false;
      if (email && email.trim() !== "") {
        // Get current user's email to compare
        const currentUser = await User.findById(member.uid).select("email");

        // Check if email actually changed
        if (currentUser && currentUser.email === email.trim()) {
          emailChanged = false;
        } else {
          emailChanged = true;

          // Managers can change emails for members and viewers only
          if (actingUserRole === "manager") {
            if (ROLE_HIERARCHY[targetMemberRole] >= ROLE_HIERARCHY.manager) {
              return res.status(403).json({
                message:
                  "Managers cannot change emails of other managers or admins",
              });
            }
          }

          // Find user with this email
          const user = await User.findOne({ email: email.trim() });
          if (!user) {
            return res.status(404).json({
              message:
                "User with this email not found. They must sign up first.",
            });
          }

          // Check if email is already used by another member in this workspace
          const existingMember = workspace.members.find(
            (m) =>
              m.uid.toString() === user._id.toString() &&
              m._id?.toString() !== memberId
          );

          if (existingMember) {
            return res.status(400).json({
              message: "This user is already a member of this workspace",
            });
          }

          // Update member's user ID
          member.uid = user._id;
          updates.push("email");
        }
      }

      // 6) Check if any actual changes were made
      if (updates.length === 0) {
        // No changes detected
        if (!role && !email) {
          return res.status(400).json({
            message:
              "No changes provided. Please specify role or email to update.",
          });
        } else {
          return res.status(200).json({
            success: true,
            data: { member },
            message: "No changes detected. Member data is already up to date.",
          });
        }
      }

      // 7) Save changes if updates were made
      await workspace.save();

      const updateMessage =
        updates.length === 2
          ? "Member role and email updated successfully"
          : updates.includes("role")
          ? `Member role updated to ${role}`
          : "Member email updated successfully";

      return res.status(200).json({
        success: true,
        data: { member },
        message: updateMessage,
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
  requireWorkspaceRole("manager"),
  async (req, res) => {
    try {
      const { memberId } = req.validated.params;

      const workspace = req.workspace;
      const actingMembership = req.membership;
      const actingUserId = req.dbUser._id;
      const actingUserRole = actingMembership.role;

      // Find the member to be deleted
      const member =
        workspace.members.id?.(memberId) ||
        workspace.members.find((m) => m._id?.toString() === memberId);

      if (!member) {
        return res.status(404).json({ message: "Workspace member not found" });
      }

      const targetMemberRole = member.role;
      const isTargetOwner =
        workspace.ownerId.toString() === member.uid.toString();

      // Role hierarchy
      const ROLE_HIERARCHY = {
        admin: 4,
        manager: 3,
        member: 2,
        viewer: 1,
      };

      // 1) Prevent deleting self
      if (member.uid.toString() === actingUserId.toString()) {
        return res.status(403).json({
          message: "You cannot remove yourself from the workspace",
        });
      }

      // 2) Prevent deleting the owner
      if (isTargetOwner) {
        return res.status(403).json({
          message: "Cannot remove the workspace owner",
        });
      }

      // 3) Permission checks based on acting user's role
      if (actingUserRole === "manager") {
        // Managers CANNOT delete other managers or admins
        if (ROLE_HIERARCHY[targetMemberRole] >= ROLE_HIERARCHY.manager) {
          return res.status(403).json({
            message: "Managers cannot remove other managers or admins",
          });
        }

        // Managers CAN only delete members and viewers
        if (!["member", "viewer"].includes(targetMemberRole)) {
          return res.status(403).json({
            message: "Managers can only remove members and viewers",
          });
        }
      }

      // 4) Remove the member
      if (workspace.members.id?.(memberId)) {
        workspace.members.id(memberId).deleteOne();
      } else {
        workspace.members = workspace.members.filter(
          (m) => m._id?.toString() !== memberId
        );
      }

      await workspace.save();

      // 5) Send notification to removed member
      const notification = new Notification({
        userId: member.uid,
        type: "membership_removed",
        title: "Membership Removed",
        message: `Your membership in "${workspace.name}" workspace was removed by ${req.dbUser.name}.`,
        payload: {
          workspaceId: workspace._id,
          actorId: req.dbUser._id,
        },
      });
      await notification.save();

      return res.json({
        success: true,
        message: "Member removed from workspace successfully",
      });
    } catch (error) {
      console.error("🏢 Remove member error:", error);
      return res.status(500).json({
        message: "Failed to remove workspace member",
      });
    }
  }
);

module.exports = router;
