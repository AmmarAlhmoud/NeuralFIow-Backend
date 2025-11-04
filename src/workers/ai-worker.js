require("dotenv").config();
const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { io } = require("socket.io-client");
const { connectDB } = require("../lib/db");
const Task = require("../models/Task");
const Comment = require("../models/Comment");
const Project = require("../models/Project");
const User = require("../models/User");
const { getGemini } = require("../lib/ai");
const {
  buildSummaryPrompt,
  buildSubtasksPrompt,
  buildPriorityPrompt,
} = require("../utils/prompts");

(async () => {
  try {
    await connectDB();
    console.log("🤖 AI Worker starting...");

    // Connect to main server's Socket.IO as worker
    const socket = io(process.env.BACKEND_URL || "http://localhost:8080", {
      auth: {
        type: "worker",
        secret: process.env.WORKER_SECRET,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 45000,
      pingTimeout: 60000,
      pingInterval: 25000,
      autoConnect: true,
      forceNew: false,
      rejectUnauthorized: process.env.NODE_ENV === "production" ? false : true,
      secure: true,
      withCredentials: false,
    });

    socket.on("connect", () => {
      console.log("🔌 Worker connected to Socket.IO server");
    });

    socket.on("disconnect", () => {
      console.log("🔌 Worker disconnected from Socket.IO server");
    });

    socket.on("connect_error", (err) => {
      console.error("🔌 Worker connection error:", err.message);
    });

    const model = getGemini();

    const worker = new Worker(
      "ai",
      async (job) => {
        const { name, data } = job;
        console.log(`🔄 Processing AI job: ${name} for task ${data.taskId}`);

        const task = await Task.findById(data.taskId).populate(
          "projectId",
          "_id"
        );
        if (!task) {
          throw new Error(`Task not found: ${data.taskId}`);
        }

        try {
          if (name === "summary") {
            const comments = await Comment.find({ taskId: task._id })
              .populate("authorId", "name")
              .sort({ createdAt: -1 })
              .limit(30);

            const prompt = buildSummaryPrompt(task, comments);
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            task.ai = task.ai || {};
            task.ai.summary = text.trim();
            task.ai.lastProcessed = new Date();
            await task.save();

            // Emit to Socket.IO
            socket.emit("ai:result", {
              type: "summary",
              taskId: task._id.toString(),
              projectId: task.projectId._id.toString(),
              data: { summary: text.trim(), lastProcessed: new Date() },
            });

            return {
              success: true,
              type: "summary",
              taskId: task._id,
            };
          }

          if (name === "subtasks") {
            const prompt = buildSubtasksPrompt(task);
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            const lines = text
              .split(/\n+/)
              .map((s) => s.replace(/^[-*\d.\)\s]+/, "").trim())
              .filter((line) => line.length > 0 && line.length < 200)
              .slice(0, 10);

            task.ai = task.ai || {};
            task.ai.suggestedSubtasks = lines;
            task.ai.lastProcessed = new Date();
            await task.save();

            // Emit to Socket.IO
            socket.emit("ai:result", {
              type: "subtasks",
              taskId: task._id.toString(),
              projectId: task.projectId._id.toString(),
              data: { subtasks: lines, lastProcessed: new Date() },
            });

            return {
              success: true,
              type: "subtasks",
              taskId: task._id,
              count: lines.length,
            };
          }

          if (name === "priority") {
            const prompt = buildPriorityPrompt(task);
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            let priority, reason;

            try {
              const parsed = JSON.parse(text.trim());
              if (
                parsed.priority &&
                ["low", "medium", "high", "critical"].includes(parsed.priority)
              ) {
                priority = parsed.priority;
                reason = parsed.reason || "AI suggested priority";
              }
            } catch (parseError) {
              const priorityMatch = text.match(/(low|medium|high|critical)/i);
              if (priorityMatch) {
                priority = priorityMatch[1].toLowerCase();
                reason = "Extracted from AI response";
              }
            }

            if (priority) {
              task.ai = task.ai || {};
              task.ai.suggestedPriority = priority;
              task.ai.priorityReason = reason;
              task.ai.lastProcessed = new Date();
              await task.save();

              // Emit to Socket.IO
              socket.emit("ai:result", {
                type: "priority",
                taskId: task._id.toString(),
                projectId: task.projectId._id.toString(),
                data: { priority, reason, lastProcessed: new Date() },
              });

              return {
                success: true,
                type: "priority",
                taskId: task._id,
                priority,
              };
            }

            throw new Error("Could not determine priority from AI response");
          }

          throw new Error(`Unknown AI job type: ${name}`);
        } catch (error) {
          console.error(`❌ AI processing failed for ${name}:`, error);
          throw error;
        }
      },
      {
        connection: {
          url: process.env.REDIS_URL || "redis://localhost:6379",
        },
        concurrency: 3,
      }
    );

    worker.on("completed", (job, result) => {
      console.log(`🎉 AI Worker completed job ${job.id}:`, result);
    });

    worker.on("failed", (job, err) => {
      console.error(`💥 AI Worker job ${job.id} failed:`, err);
    });

    console.log("🚀 AI Worker started successfully");

    process.on("SIGTERM", async () => {
      console.log("🔄 AI Worker shutting down...");
      socket.disconnect();
      await worker.close();
      await mongoose.connection.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("🔄 AI Worker shutting down...");
      socket.disconnect();
      await worker.close();
      await mongoose.connection.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("💥 AI Worker failed to start:", error);
    process.exit(1);
  }
})();
