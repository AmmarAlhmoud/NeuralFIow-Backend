const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { firebaseAuthMiddleware } = require("../middleware/auth");

router.get("/me", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;

    let user = await User.findOne({ uid });

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
