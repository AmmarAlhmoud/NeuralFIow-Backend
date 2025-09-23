require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const https = require("https");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const { connectDB } = require("./lib/db");
const routes = require("./routes");
const { attachIO } = require("./middleware/attach-io");
const { decodeSocketAuth } = require("./middleware/auth");

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Create HTTPs server + Socket.IO
const key = fs.readFileSync("localhost-key.pem");
const cert = fs.readFileSync("localhost.pem");

const server = https.createServer({ key, cert }, app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket.IO authentication and room management
io.use(decodeSocketAuth);

io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.user?.uid} (${socket.id})`);

  // Join user-specific room for notifications
  socket.join(`user:${socket.user.uid}`);

  socket.on("subscribe", ({ type, id }) => {
    socket.join(`${type}:${id}`);
    console.log(`📡 User ${socket.user.uid} subscribed to ${type}:${id}`);
  });

  socket.on("unsubscribe", ({ type, id }) => {
    socket.leave(`${type}:${id}`);
    console.log(`📡 User ${socket.user.uid} unsubscribed from ${type}:${id}`);
  });

  socket.on("disconnect", () => {
    console.log(`👋 User disconnected: ${socket.user?.uid} (${socket.id})`);
  });
});

// Attach Socket.IO to request object
app.use(attachIO(io));

// API routes
app.use("/api/v1", routes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);

  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Process terminated");
  });
});

// Start server
(async () => {
  try {
    await connectDB();
    const port = process.env.PORT || 8080;

    server.listen(port, () => {
      console.log(`🚀 AI Task Platform API listening on port ${port}`);
      console.log(`📱 Socket.IO enabled for real-time updates`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("💥 Failed to start server:", error);
    process.exit(1);
  }
})();
