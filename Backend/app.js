import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';
import router from './routes/maps.routes.js';
import apiRouter from './routes/apiRoutes.js';
import redisClient from './config/redis.js';
const app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

app.use(express.json({ limit: "256kb" }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()"
  });
  next();
});

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Reporter-Key", "X-Admin-Key"],
    exposedHeaders: ["X-Cache", "X-Response-Time", "Retry-After"],
    maxAge: 86400
  })
);

function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ message: "Admin API is not configured" });
    return next();
  }
  const supplied = req.get("X-Admin-Key") || "";
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return res.status(401).json({ message: "Unauthorized" });
  return next();
}

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});

app.get('/api/ready', async (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = redisClient.isReady;

  const payload = {
    status: mongoReady && redisReady ? 'ready' : 'not_ready',
    dependencies: {
      mongodb: mongoReady ? 'up' : 'down',
      redis: redisReady ? 'up' : 'down'
    }
  };

  return res.status(mongoReady && redisReady ? 200 : 503).json(payload);
});
app.use('/maps' , router)
app.use("/api/admin", adminAuth);
app.use('/api', apiRouter);

app.use((error, req, res, next) => {
  if (error?.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON request body" });
  if (error?.message === "Origin is not allowed") return res.status(403).json({ message: "Origin is not allowed" });
  console.error("Unhandled request error:", error?.message);
  return res.status(500).json({ message: "Internal server error" });
});

export default app;
