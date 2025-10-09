const admin = require("firebase-admin");
const { verifyIdToken } = require("../lib/firebase");
const User = require("../models/User");

async function firebaseAuthMiddleware(req, res, next) {
  try {
    let token = req.cookies?.token;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Verify token with Firebase
    const decoded = await verifyIdToken(token);
    const userData = await admin.auth().getUser(decoded.uid);

    let user = await User.findOne({ uid: userData.uid });
    if (!user) {
      user = await User.create({
        uid: userData.uid,
        email: userData.email,
        name: userData.displayName,
        avatarURL: userData.photoURL,
      });
    }

    user.isOnline = true;
    await user.save();

    if (!req.cookies?.token) {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: process.env.NODE_ENV === "production" ? "Lax" : "None",
      };
      res.cookie("token", token, cookieOptions);
    }

    // Attach user info to request
    req.user = userData;
    req.dbUser = user;

    next();
  } catch (error) {
    console.error("🔐 Authentication error:", error);
    if (error.code === "auth/id-token-expired") {
      res.status(401).send({ error: "Token expired, please refresh." });
    } else {
      res.status(401).send({ error: "Unauthorized" });
    }
  }
}

async function decodeSocketAuth(socket, next) {
  try {
    let token = socket.handshake.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      token = socket.handshake.auth?.token;
    }

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
