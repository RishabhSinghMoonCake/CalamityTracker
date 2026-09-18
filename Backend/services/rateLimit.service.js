import redisClient from "../config/redis.js";

export async function consumeRateLimit({ key, limit, windowSeconds }) {
  const value = await redisClient.incr(key);

  if (value === 1) {
    await redisClient.expire(key, windowSeconds);
  }

  const retryAfterSeconds = Math.max(await redisClient.ttl(key), 0);
  return { allowed: value <= limit, value, limit, retryAfterSeconds };
}
