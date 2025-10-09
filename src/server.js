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
const { initializeSocketManager } = require("./workers/socketManager");

const app = express();

// Middleware setup
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

// HTTPS server with certificates
const key = fs.readFileSync("localhost-key.pem");
const cert = fs.readFileSync("localhost.pem");
const server = https.createServer({ key, cert }, app);

// Socket.IO server instance
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket.IO auth middleware
io.use(decodeSocketAuth);

// Main async startup
(async () => {
  try {
    // Connect to database
    await connectDB();

    // Initialize socket manager with Redis
    await initializeSocketManager(io);

    // Attach Socket.IO instance to request object
    app.use(attachIO(io));

    // Routes setup
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

    const port = process.env.PORT || 8080;

    // Start server listening
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

// Graceful shutdown on SIGTERM
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ Process terminated");
  });
});
