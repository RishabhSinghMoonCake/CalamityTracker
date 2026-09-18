import redisClient from "../config/redis.js";

const BUDGET_KEY_PREFIX = "ai:daily-budget";
const COOLDOWN_KEY = "ai:cooldown";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseRetrySeconds(error) {
  const message = String(error?.message || "");
  const match = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(Number(match[1])) : 0;
}

export function isQuotaError(error) {
  const message = String(error?.message || "");
  return error?.status === "RESOURCE_EXHAUSTED" ||
    error?.code === 429 ||
    /quota exceeded|resource_exhausted|rate limit/i.test(message);
}

export async function acquireAiRequest() {
  const cooldownTtl = await redisClient.ttl(COOLDOWN_KEY);

  if (cooldownTtl > 0) {
    return { allowed: false, reason: "cooldown", retryAfterSeconds: cooldownTtl };
  }

  const budget = Number(process.env.AI_DAILY_REQUEST_BUDGET || 15);
  const key = `${BUDGET_KEY_PREFIX}:${todayKey()}`;
  const used = await redisClient.incr(key);

  if (used === 1) {
    await redisClient.expire(key, 2 * 24 * 60 * 60);
  }

  if (used > budget) {
    return { allowed: false, reason: "daily_budget", used, budget };
  }

  return { allowed: true, used, budget };
}

export async function activateAiCooldown(error) {
  const providerRetry = parseRetrySeconds(error);
  const configured = Number(process.env.AI_RATE_LIMIT_COOLDOWN_SECONDS || 86400);
  const seconds = Math.max(providerRetry, configured);

  await redisClient.set(COOLDOWN_KEY, "1", { EX: seconds });
  return seconds;
}
