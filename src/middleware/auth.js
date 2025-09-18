const { verifyIdToken } = require("../lib/firebase");
const User = require("../models/User");

async function firebaseAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No authentication token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyIdToken(token);

    let user = await User.findOne({ uid: decoded.uid });
    if (!user) {
      user = await User.create({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        avatarUrl: decoded.picture,
      });
    }

    req.user = decoded;
    req.dbUser = user;
    next();
  } catch (error) {
    console.error("🔐 Authentication error:", error);
    return res.status(401).json({
      message: "Invalid authentication token",
    });
  }
}

async function decodeSocketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("No authentication token provided"));
    }

    const decoded = await verifyIdToken(token);
    socket.user = decoded;

    next();
  } catch (error) {
    console.error("🔐 Socket authentication error:", error);
    next(new Error("Invalid authentication token"));
  }
}

module.exports = { firebaseAuthMiddleware, decodeSocketAuth };
