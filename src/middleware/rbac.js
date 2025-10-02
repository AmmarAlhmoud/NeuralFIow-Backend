const Workspace = require("../models/Workspace");

const ROLE_HIERARCHY = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
};

function requireWorkspaceRole(minRole) {
  return async (req, res, next) => {
    try {
      const workspaceId =
        req.params.wid ||
        req.params.workspaceId ||
        req.body.workspaceId ||
        req.query.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({
          message: "Workspace ID is required",
        });
      }

      const { _id } = req.dbUser;

      const workspace = await Workspace.findById(workspaceId).lean();
      if (!workspace) {
        return res.status(404).json({
          message: "Workspace not found",
        });
      }

      const membership = workspace.members.find(
        (m) => m.uid.toString() === _id.toString()
      );
      if (!membership) {
        return res.status(403).json({
          message: "You are not a member of this workspace",
        });
      }

      const userRoleLevel = ROLE_HIERARCHY[membership.role] || 0;
      const requiredRoleLevel = ROLE_HIERARCHY[minRole] || 0;

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          message: `Insufficient permissions. Required: ${minRole}, Current: ${membership.role}`,
        });
      }

      req.workspace = workspace;
      req.membership = membership;

      next();
    } catch (error) {
      console.error("🛡️ RBAC error:", error);
      res.status(500).json({
        message: "Authorization check failed",
      });
    }
  };
}

module.exports = { requireWorkspaceRole, ROLE_HIERARCHY };
