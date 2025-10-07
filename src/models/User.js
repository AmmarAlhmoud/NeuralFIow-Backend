const { Schema, model } = require("mongoose");

const UserSchema = new Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    name: String,
    avatarURL: String,
    position: {
      type: String,
      default: "Not set",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = model("User", UserSchema);
