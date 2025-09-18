const express = require("express");
const router = express.Router();
const { firebaseAuthMiddleware } = require("../middleware/auth");

router.use("/auth", require("./auth"));
router.use(firebaseAuthMiddleware);
router.use("/workspaces", require("./workspaces"));
router.use("/projects", require("./projects"));
router.use("/lists", require("./lists"));
router.use("/tasks", require("./tasks"));
router.use("/comments", require("./comments"));
router.use("/notifications", require("./notifications"));

module.exports = router;
