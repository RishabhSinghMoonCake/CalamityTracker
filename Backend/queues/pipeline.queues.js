import { Queue } from "bullmq";

import IORedis from "ioredis";

export const bullConnection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null
  }
);

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

export const newsIngestionQueue = new Queue(
  "news-ingestion",
  {
    connection: bullConnection,
    defaultJobOptions
  }
);

export const aiProcessingQueue = new Queue(
  "ai-processing",
  {
    connection: bullConnection,
    defaultJobOptions
  }
);

export const incidentCreationQueue = new Queue(
  "incident-creation",
  {
    connection: bullConnection,
    defaultJobOptions
  }
);

export async function closeQueues() {
  await Promise.all([
    newsIngestionQueue.close(),
    aiProcessingQueue.close(),
    incidentCreationQueue.close()
  ]);

  if (bullConnection.status !== "end") {
    await bullConnection.quit();
  }
}