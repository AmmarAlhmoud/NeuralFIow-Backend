const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { firebaseAuthMiddleware } = require("../middleware/auth");

router.get("/me", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;

    let user = await User.findOne({ uid });

    if (!user) {
      user = await User.create({
        uid,
        email,
        name,
        avatarUrl: picture,
      });
    }

    res.json({
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

module.exports = router;
