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
        "task_assigned",
        "task_updated",
        "comment_added",
        "status_changed",
        "mention",
        "workspace_invite",
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
