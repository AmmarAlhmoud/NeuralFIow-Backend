const { Schema, model } = require("mongoose");

const NotificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "membership_invite",
        "membership_invite_status",
        "membership_removed",
        "role_updated",
        "task_assigned",
        "task_updated",
        "task_deleted",
        "comment_added",
        "status_changed",
        "mention",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: String,
    payload: {
      taskId: { type: Schema.Types.ObjectId, ref: "Task" },
      workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
      projectId: { type: Schema.Types.ObjectId, ref: "Project" },
      actorId: { type: Schema.Types.ObjectId, ref: "User" },
      inviteId: { type: Schema.Types.ObjectId, ref: "Invite" },
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = model("Notification", NotificationSchema);
