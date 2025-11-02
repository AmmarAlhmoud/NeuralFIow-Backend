const { createClient } = require("redis");

let ioInstance;
const userSockets = new Map();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    tls: true,
    rejectUnauthorized: false,
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        console.error("❌ Redis: Max reconnection attempts reached");
        return new Error("Max reconnection attempts reached");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

// Handle Redis connection errors
redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("✅ Redis connected successfully");
});

const userRoomsKey = (userId) => `userRooms:${userId}`;

const initializeSocketManager = async (io) => {
  ioInstance = io;

  try {
    await redisClient.connect();
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    throw error;
  }

  io.on("connection", async (socket) => {
    // Handle worker connections
    if (socket.isWorker) {
      console.log(`🤖 AI Worker connected: ${socket.id}`);

      // Handle AI results from worker
      socket.on("ai:result", (data) => {
        console.log(
          `🤖 Broadcasting AI ${data.type} result for task ${data.taskId}`
        );

        // Broadcast to project room
        const projectId = data.projectId;
        console.log("Project ID:", projectId);

        io.to(`project:${projectId}`).emit("ai:completed", {
          type: data.type,
          taskId: data.taskId,
          data: data.data,
        });
      });

      socket.on("disconnect", () => {
        console.log(`🤖 AI Worker disconnected: ${socket.id}`);
      });

      return;
    }

    // Regular user connection handling
    const userId = socket.user?.uid;
    if (!userId) {
      console.log(`Socket connected without user id: ${socket.id}`);
      return;
    }

    console.log(`👤 User connected: ${userId} (${socket.id})`);

    // Track socket ID in-memory
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Auto-join stored rooms from Redis
    try {
      const rooms = await redisClient.sMembers(userRoomsKey(userId));
      rooms.forEach((roomName) => {
        socket.join(roomName);
        console.log(
          `Socket ${socket.id} of user ${userId} auto-joined room ${roomName}`
        );
      });
    } catch (error) {
      console.error(`❌ Failed to load rooms for user ${userId}:`, error);
    }

    // Subscribe user to a new room and persist in Redis
    socket.on("subscribe", async ({ type, id }) => {
      try {
        const roomName = `${type}:${id}`;
        socket.join(roomName);
        console.log(`📡 User ${userId} subscribed to ${roomName}`);
        await redisClient.sAdd(userRoomsKey(userId), roomName);
      } catch (error) {
        console.error(`❌ Failed to subscribe user ${userId}:`, error);
      }
    });

    // Unsubscribe user from a room and remove from Redis
    socket.on("unsubscribe", async ({ type, id }) => {
      try {
        const roomName = `${type}:${id}`;
        socket.leave(roomName);
        console.log(`📡 User ${userId} unsubscribed from ${roomName}`);
        await redisClient.sRem(userRoomsKey(userId), roomName);
      } catch (error) {
        console.error(`❌ Failed to unsubscribe user ${userId}:`, error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`👋 User disconnected: ${userId} (${socket.id})`);
      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        if (userSockets.get(userId).size === 0) userSockets.delete(userId);
      }
    });
  });
};

// Join all sockets of a user to a room and persist subscription in Redis
const joinUserSocketsToRoom = async (userId, roomName) => {
  const socketIds = userSockets.get(userId);
  if (socketIds && ioInstance) {
    socketIds.forEach((socketId) => {
      const userSocket = ioInstance.sockets.sockets.get(socketId);
      if (userSocket) {
        userSocket.join(roomName);
        console.log(
          `Socket ${socketId} of user ${userId} joined room ${roomName}`
        );
      }
    });

    try {
      await redisClient.sAdd(userRoomsKey(userId), roomName);
    } catch (error) {
      console.error(
        `❌ Failed to persist room ${roomName} for user ${userId}:`,
        error
      );
    }
  }
};

// Emit to specific room (useful for broadcasting AI results manually)
const emitToRoom = (roomName, event, data) => {
  if (ioInstance) {
    ioInstance.to(roomName).emit(event, data);
    console.log(`📤 Emitted ${event} to room ${roomName}`);
  }
};

// Get IO instance for use in other modules
const getIO = () => {
  if (!ioInstance) {
    throw new Error(
      "Socket.IO not initialized. Call initializeSocketManager first."
    );
  }
  return ioInstance;
};

// Graceful shutdown
const closeSocketManager = async () => {
  console.log("🔄 Closing Socket Manager...");
  if (redisClient.isOpen) {
    await redisClient.quit();
    console.log("✅ Redis connection closed");
  }
};

module.exports = {
  initializeSocketManager,
  joinUserSocketsToRoom,
  emitToRoom,
  getIO,
  closeSocketManager,
};
