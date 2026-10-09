import { createClient } from "redis";

const isTls = (process.env.REDIS_URL || "").startsWith("rediss://");

const redisClient = createClient({
  url: process.env.REDIS_URL,
  ...(isTls && {
    socket: {
      tls: true,
      rejectUnauthorized: false
    }
  })
});

redisClient.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

export async function connectRedis() {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();
  console.log("Redis connection established successfully");
}

export default redisClient;
