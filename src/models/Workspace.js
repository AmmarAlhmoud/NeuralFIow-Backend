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
    color: {
      type: String,
      default: "#7f22fe",
    },
    members: [
      {
        uid: {
          type: Schema.Types.ObjectId,
          ref: "User",
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
      timezone: { type: String, default: "Europe/Istanbul" },
      allowInvites: { type: Boolean, default: true },
      aiModel: { type: String, default: "Gemini" },
    },
  },
  { timestamps: true }
);

module.exports = model("Workspace", WorkspaceSchema);
