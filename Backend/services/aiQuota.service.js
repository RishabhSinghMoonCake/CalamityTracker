import redisClient from "../config/redis.js";

const BUDGET_KEY_PREFIX = "ai:daily-budget";
const COOLDOWN_KEY = "ai:cooldown";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseRetrySeconds(error) {
  if (Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) {
    return Math.ceil(error.retryAfterSeconds);
  }
  const message = String(error?.message || "");
  const match = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(Number(match[1])) : 0;
}

export function isQuotaError(error) {
  const message = String(error?.message || "");
  return (
    error?.status === "RESOURCE_EXHAUSTED" ||
    error?.code === 429 ||
    error?.status === 429 ||
    /quota exceeded|resource_exhausted|rate limit|too many requests|429/i.test(message)
  );
}

export function cooldownKeyFor(provider = "gemini") {
  return `ai:cooldown:${provider.toLowerCase()}`;
}

export async function checkProviderAvailability(provider = "gemini") {
  try {
    if (!redisClient?.isReady) return { available: true, cooldownTtl: 0 };
    const key = cooldownKeyFor(provider);
    const ttl = await redisClient.ttl(key);
    if (ttl > 0) {
      return { available: false, cooldownTtl: ttl, reason: "cooldown" };
    }
    return { available: true, cooldownTtl: 0 };
  } catch (error) {
    console.warn(`Error checking availability for ${provider}:`, error.message);
    return { available: true, cooldownTtl: 0 };
  }
}

export async function activateProviderCooldown(provider = "gemini", error = null, customSeconds = null) {
  const providerRetry = parseRetrySeconds(error);
  // Groq supplies retry-after for short quota windows. A one-day default turns a
  // transient 429 into an unnecessary pipeline outage.
  const configured = customSeconds ?? Number(process.env.AI_RATE_LIMIT_COOLDOWN_SECONDS || 60);
  const seconds = Math.max(providerRetry, configured);

  try {
    if (redisClient?.isReady) {
      await redisClient.set(cooldownKeyFor(provider), "1", { EX: seconds });
    }
  } catch (err) {
    console.warn(`Failed to set cooldown for ${provider}:`, err.message);
  }
  return seconds;
}

export async function acquireAiRequest(provider = "gemini") {
  try {
    if (!redisClient?.isReady) {
      return { allowed: true, used: 1, budget: 100 };
    }

    const avail = await checkProviderAvailability(provider);
    if (!avail.available) {
      return { allowed: false, reason: "cooldown", retryAfterSeconds: avail.cooldownTtl, provider };
    }

    const budget = Number(process.env.AI_DAILY_REQUEST_BUDGET || 50);
    const key = `${BUDGET_KEY_PREFIX}:${provider.toLowerCase()}:${todayKey()}`;
    const used = await redisClient.incr(key);

    if (used === 1) {
      await redisClient.expire(key, 2 * 24 * 60 * 60);
    }

    if (used > budget) {
      return { allowed: false, reason: "daily_budget", used, budget, provider };
    }

    return { allowed: true, used, budget, provider };
  } catch (error) {
    console.warn(`Quota acquisition check failed for ${provider}:`, error.message);
    return { allowed: true, used: 0, budget: 0, provider };
  }
}

export async function activateAiCooldown(error) {
  return activateProviderCooldown("gemini", error);
}

export async function getProvidersHealthStatus(providers = ["groq-primary", "groq-fallback-1"]) {
  const status = {};
  for (const provider of providers) {
    const avail = await checkProviderAvailability(provider);
    status[provider] = {
      available: avail.available,
      cooldownTtl: avail.cooldownTtl,
      status: avail.available ? "healthy" : "cooling_down"
    };
  }
  return status;
}
