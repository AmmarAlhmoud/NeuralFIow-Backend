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
  },
  { timestamps: true }
);

module.exports = model("User", UserSchema);
