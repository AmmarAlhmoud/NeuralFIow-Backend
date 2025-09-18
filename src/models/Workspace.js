const { Schema, model } = require("mongoose");

const WorkspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        uid: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "manager", "member", "viewer"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    settings: {
      allowInvites: { type: Boolean, default: true },
      isPublic: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = model("Workspace", WorkspaceSchema);
