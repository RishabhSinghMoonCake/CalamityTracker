import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const isTls = redisUrl.startsWith("rediss://");

export const bullConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  ...(isTls && {
    tls: {
      rejectUnauthorized: false
    }
  }),
  retryStrategy(times) {
    if (times > 3) return null; // stop reconnecting if Redis is not running
    return Math.min(times * 100, 1000);
  }
});

// Prevent unhandled error event crashes in environments without active Redis
bullConnection.on("error", (err) => {
  // Handled silently for offline test runners
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 1000
  }
};

export const newsIngestionQueue = new Queue("news-ingestion", {
  connection: bullConnection,
  defaultJobOptions
});

export const aiProcessingQueue = new Queue("ai-processing", {
  connection: bullConnection,
  defaultJobOptions
});

export const incidentCreationQueue = new Queue("incident-creation", {
  connection: bullConnection,
  defaultJobOptions
});

export const communityProcessingQueue = new Queue("community-processing", {
  connection: bullConnection,
  defaultJobOptions
});

// Suppress queue errors when Redis is not running in unit tests
[newsIngestionQueue, aiProcessingQueue, incidentCreationQueue, communityProcessingQueue].forEach((q) => {
  q.on("error", () => {});
});

export const allQueues = {
  "news-ingestion": newsIngestionQueue,
  "ai-processing": aiProcessingQueue,
  "incident-creation": incidentCreationQueue,
  "community-processing": communityProcessingQueue
};

export async function getQueueMetrics() {
  const metrics = {};

  for (const [name, queue] of Object.entries(allQueues)) {
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused"
      );
      metrics[name] = counts;
    } catch (err) {
      metrics[name] = { status: "unreachable", error: err.message };
    }
  }

  return metrics;
}

export async function retryFailedJobs(queueName) {
  const queue = allQueues[queueName];
  if (!queue) throw new Error(`Queue "${queueName}" not found`);

  const failedJobs = await queue.getFailed(0, 100);
  let retriedCount = 0;

  for (const job of failedJobs) {
    await job.retry();
    retriedCount++;
  }

  return { queue: queueName, retriedCount };
}

export async function closeQueues() {
  await Promise.all(Object.values(allQueues).map((q) => q.close()));

  if (bullConnection.status !== "end") {
    await bullConnection.quit();
  }
}