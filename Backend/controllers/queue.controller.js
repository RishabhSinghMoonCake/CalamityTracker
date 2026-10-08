import redisClient from "../config/redis.js";
import { getProvidersHealthStatus } from "../services/aiQuota.service.js";
import { aiRouter } from "../services/aiRouter.service.js";

export async function getQueueStatus(req, res) {
  try {
    if (!redisClient?.isReady) {
      return res.status(200).json({
        timestamp: new Date().toISOString(),
        status: "redis_offline",
        message: "Redis is not connected. Queues are in offline state.",
        queues: {
          "news-ingestion": { status: "offline" },
          "ai-processing": { status: "offline" },
          "incident-creation": { status: "offline" },
          "community-processing": { status: "offline" }
        }
      });
    }

    const { getQueueMetrics } = await import("../queues/pipeline.queues.js");
    const metrics = await getQueueMetrics();
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      status: "online",
      queues: metrics
    });
  } catch (error) {
    console.error("Failed to retrieve queue metrics:", error.message);
    return res.status(500).json({ message: "Failed to retrieve queue status", error: error.message });
  }
}

export async function retryQueueJobs(req, res) {
  try {
    const { name } = req.params;
    if (!redisClient?.isReady) {
      return res.status(503).json({ message: "Redis is not connected" });
    }

    const { retryFailedJobs } = await import("../queues/pipeline.queues.js");
    const result = await retryFailedJobs(name);
    return res.status(200).json({
      message: `Retried ${result.retriedCount} failed jobs in queue "${name}"`,
      ...result
    });
  } catch (error) {
    console.error("Failed to retry queue jobs:", error.message);
    return res.status(400).json({ message: error.message });
  }
}

export async function getAiProvidersStatus(req, res) {
  try {
    const configuredChain = aiRouter.getRoutingChain();
    const health = await getProvidersHealthStatus(configuredChain);
    return res.status(200).json({
      routingChain: configuredChain,
      providers: health
    });
  } catch (error) {
    console.error("Failed to check AI providers status:", error.message);
    return res.status(500).json({ message: "Failed to check AI status", error: error.message });
  }
}
