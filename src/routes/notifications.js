const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.dbUser._id })
      .populate("payload.actorId", "_id name email avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: req.dbUser._id,
      read: false,
    });

    res.status(200).json({
      success: true,
      data: {
        length: unreadCount,
        data: notifications,
      },
    });
  } catch (error) {
    console.error("🔔 Get notifications error:", error);
    res.status(500).json({
      message: "Failed to fetch notifications",
    });
  }
});

router.delete("/", async (req, res) => {
  try {
    const notification = await Notification.deleteMany({
      userId: req.dbUser._id,
    });

    if (!notification) {
      return res.status(404).json({
        message: "Notifications not found",
      });
    }

    res.status(204).json({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error("🔔 All notifications deleted error:", error);
    res.status(500).json({
      message: "Failed to delete all notifications",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.dbUser._id,
    });

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.status(204).json({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error("🔔 Notification deleted error:", error);
    res.status(500).json({
      message: "Failed to delete notification",
    });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.dbUser._id },
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

    res.status(200).json({
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

router.patch("/mark-all-read", async (req, res) => {
  try {
    const notifications = await Notification.updateMany(
      { userId: req.dbUser._id, read: false },
      {
        read: true,
        readAt: new Date(),
      }
    );

    if (!notifications) {
      return res.status(404).json({
        message: "Notifications not found",
      });
    }

    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("🔔 Mark all notifications read error:", error);
    res.status(500).json({
      message: "Failed to mark all notifications as read",
    });
  }
});

module.exports = router;
