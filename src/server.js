require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const https = require("https");
const http = require("http");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const { connectDB } = require("./lib/db");
const routes = require("./routes");
const { attachIO } = require("./middleware/attach-io");
const { decodeSocketAuth } = require("./middleware/auth");
const {
  initializeSocketManager,
  closeSocketManager,
} = require("./workers/socketManager");

const app = express();

const requiredEnvVars = [
  "MONGO_URI",
  "REDIS_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GEMINI_API_KEY",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

console.log("✅ All required environment variables are set");

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

// Create server based on environment
const isDevelopment = process.env.NODE_ENV !== "production";
let server;

if (isDevelopment) {
  // HTTPS in development
  try {
    const key = fs.readFileSync("localhost-key.pem");
    const cert = fs.readFileSync("localhost.pem");
    server = https.createServer({ key, cert }, app);
  } catch (error) {
    console.warn("⚠️  HTTPS certificates not found, falling back to HTTP");
    server = http.createServer(app);
  }
} else {
  // HTTP in production
  server = http.createServer(app);
}

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
      const protocol = isDevelopment ? "https" : "http";
      console.log(
        `🚀 AI Task Platform API listening on ${protocol}://localhost:${port}`
      );
      console.log(`📱 Socket.IO enabled for real-time updates`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("💥 Failed to start server:", error);
    process.exit(1);
  }
})();

// Graceful shutdown on SIGTERM
process.on("SIGTERM", async () => {
  console.log("🔄 SIGTERM received, shutting down gracefully");
  await closeSocketManager();
  server.close(() => {
    console.log("✅ Process terminated");
  });
});
