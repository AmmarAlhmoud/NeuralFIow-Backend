const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { firebaseAuthMiddleware } = require("../middleware/auth");

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

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: process.env.NODE_ENV === "production" ? "Lax" : "None",
  });
  res.status(200).json({ message: "Logged out" });
});

module.exports = router;
