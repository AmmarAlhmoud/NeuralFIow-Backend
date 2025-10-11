const express = require("express");
const router = express.Router();
const { z } = require("zod");
const admin = require("firebase-admin");
const User = require("../models/User");
const {
  firebaseAuthMiddleware,
  attatchAuthUser,
} = require("../middleware/auth");
const { validate, commonSchemas } = require("../middleware/validate");

router.post("/", firebaseAuthMiddleware, (req, res) => {
  res.status(200).json({ message: "Authinticated" });
});

router.get("/me", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;

    let user = await User.findOne({ uid });

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("👤 Get user profile error:", error);
    res.status(500).json({
      message: "Failed to get user profile",
    });
  }
});

const updateUserProfileSchema = z.object({
  body: z.object({
    name: z.string(),
    email: commonSchemas.email,
    position: z.string().optional(),
  }),
});

router.patch(
  "/me",
  firebaseAuthMiddleware,
  validate(updateUserProfileSchema),
  async (req, res) => {
    const { uid, providerData, email: firebaseEmail } = req.user;
    const { name, email, position } = req.validated.body;

    let provider = providerData[0].providerId;

    if (!uid || !name || !provider) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    try {
      if (provider === "google.com") {
        await admin.auth().updateUser(uid, { displayName: name });
      } else {
        await admin.auth().updateUser(uid, {
          email: email,
          displayName: name,
        });
      }

      let newPosition = position;
      if (position === "") {
        newPosition = "Not set";
      }

      const updatedUser = await User.findOneAndUpdate(
        { uid },
        {
          name,
          email: provider === "google.com" ? firebaseEmail : email,
          position: newPosition,
        },
        { new: true }
      );

      res.status(200).json({ message: "Profile updated.", data: updatedUser });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile.", error });
    }
  }
);

router.post("/logout", attatchAuthUser, async (req, res) => {
  try {
    req.dbUser.isOnline = false;
    await req.dbUser.save();

    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === "production" ? "Lax" : "None",
    });
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

module.exports = router;
