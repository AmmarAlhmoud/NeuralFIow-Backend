const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const User = require("../models/User");

router.get("/", async (req, res) => {
  try {
    const userUid = req.user.uid;
    const user = await User.findOne({ uid: userUid });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const notifications = await Notification.find({ userId: user._id })
      .populate("payload.actorId", "name email avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: user._id,
      read: false,
    });

    res.json({
      success: true,
      data: notifications,
      meta: {
        unreadCount,
      },
    });
  } catch (error) {
    console.error("🔔 Get notifications error:", error);
    res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const userUid = req.user.uid;
    const user = await User.findOne({ uid: userUid });

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: user._id },
      {
        read: true,
        readAt: new Date(),
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("🔔 Mark notification read error:", error);
    res.status(500).json({
      message: "Failed to mark notification as read",
    });
  }
});

module.exports = router;
