const { Queue } = require("bullmq");

const aiQueue = new Queue("ai", {
  connection: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

aiQueue.on("completed", (job) => {
  console.log(`🤖 AI job ${job.id} completed: ${job.name}`);
});

aiQueue.on("failed", (job, err) => {
  console.error(`❌ AI job ${job.id} failed: ${job.name}`, err);
});

module.exports = { aiQueue };
