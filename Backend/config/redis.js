import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

export async function connectRedis() {
  await redisClient.connect();
  console.log("Redis connection established successfully");
}

export default redisClient;