const mongoose = require("mongoose");
const { Schema } = mongoose;

const inviteSchema = new Schema({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  role: {
    type: String,
    enum: ["manager", "member", "viewer"],
    default: "member",
  },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  respondedAt: Date,
});

const Invite = mongoose.model("Invite", inviteSchema);
module.exports = Invite;
