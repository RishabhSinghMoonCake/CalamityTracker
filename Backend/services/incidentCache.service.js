import redisClient from "../config/redis.js";

export async function invalidateIncidentsCache() {
  try {
    await redisClient.incr("incidents:cache-version");
  } catch (error) {
    console.warn(
      "Incident cache invalidation failed:",
      error.message
    );
  }
}
