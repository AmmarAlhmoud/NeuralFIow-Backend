require("dotenv").config();
const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { connectDB } = require("../lib/db");
const Task = require("../models/Task");
const Comment = require("../models/Comment");
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

    const model = getGemini();

    const worker = new Worker(
      "ai",
      async (job) => {
        const { name, data } = job;
        console.log(`🔄 Processing AI job: ${name} for task ${data.taskId}`);

        const task = await Task.findById(data.taskId);
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

            console.log(`✅ Generated summary for task ${task._id}`);
            return { success: true, type: "summary", taskId: task._id };
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

            console.log(
              `✅ Generated ${lines.length} subtasks for task ${task._id}`
            );
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

            try {
              const parsed = JSON.parse(text.trim());
              if (
                parsed.priority &&
                ["low", "medium", "high", "critical"].includes(parsed.priority)
              ) {
                task.ai = task.ai || {};
                task.ai.suggestedPriority = parsed.priority;
                task.ai.lastProcessed = new Date();
                await task.save();

                console.log(
                  `✅ Suggested priority '${parsed.priority}' for task ${task._id}`
                );
                return {
                  success: true,
                  type: "priority",
                  taskId: task._id,
                  priority: parsed.priority,
                };
              }
            } catch (parseError) {
              const priorityMatch = text.match(/(low|medium|high|critical)/i);
              if (priorityMatch) {
                const priority = priorityMatch[1].toLowerCase();
                task.ai = task.ai || {};
                task.ai.suggestedPriority = priority;
                task.ai.lastProcessed = new Date();
                await task.save();

                console.log(
                  `✅ Extracted priority '${priority}' for task ${task._id}`
                );
                return {
                  success: true,
                  type: "priority",
                  taskId: task._id,
                  priority,
                };
              }
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
      await worker.close();
      await mongoose.connection.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("💥 AI Worker failed to start:", error);
    process.exit(1);
  }
})();
