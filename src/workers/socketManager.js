const { createClient } = require("redis");

let ioInstance;
const userSockets = new Map();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

const userRoomsKey = (userId) => `userRooms:${userId}`;

const initializeSocketManager = async (io) => {
  ioInstance = io;

  await redisClient.connect();

  io.on("connection", async (socket) => {
    const userId = socket.user?._id;
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
    const rooms = await redisClient.sMembers(userRoomsKey(userId));
    rooms.forEach((roomName) => {
      socket.join(roomName);
      console.log(
        `Socket ${socket.id} of user ${userId} auto-joined room ${roomName}`
      );
    });

    // Subscribe user to a new room and persist in Redis
    socket.on("subscribe", async ({ type, id }) => {
      const roomName = `${type}:${id}`;
      socket.join(roomName);
      console.log(`📡 User ${userId} subscribed to ${roomName}`);
      await redisClient.sAdd(userRoomsKey(userId), roomName);
    });

    // Unsubscribe user from a room and remove from Redis
    socket.on("unsubscribe", async ({ type, id }) => {
      const roomName = `${type}:${id}`;
      socket.leave(roomName);
      console.log(`📡 User ${userId} unsubscribed from ${roomName}`);
      await redisClient.sRem(userRoomsKey(userId), roomName);
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
    await redisClient.sAdd(userRoomsKey(userId), roomName);
  }
};

module.exports = {
  initializeSocketManager,
  joinUserSocketsToRoom,
};
