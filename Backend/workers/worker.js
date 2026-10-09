import mongoose from "mongoose";
import connectDB from "../db/db.js";
import redisClient, { connectRedis } from "../config/redis.js";

const automationEnabled = process.env.PIPELINE_AUTOMATION_ENABLED === "true";

let newsWorker;
let aiWorker;
let incidentWorker;
let communityWorker;
let closeQueues = async () => {};

async function startWorker() {
  if (!automationEnabled) {
    console.log(
      "Pipeline automation is disabled. Set PIPELINE_AUTOMATION_ENABLED=true to run workers."
    );
    return;
  }

  const [
    { Worker },
    queueModule,
    { default: RawArticle },
    { ingestNews },
    { processArticleById, processPendingBatch },
    { createIncidentFromExtraction },
    { invalidateIncidentsCache },
    { createCommunityReport }
  ] = await Promise.all([
    import("bullmq"),
    import("../queues/pipeline.queues.js"),
    import("../models/rawArticle.model.js"),
    import("../services/newsIngestion.service.js"),
    import("../services/aiProcessing.service.js"),
    import("../services/incidentCreation.service.js"),
    import("../services/incidentCache.service.js"),
    import("../services/communityReport.service.js")
  ]);

  const {
    bullConnection,
    newsIngestionQueue,
    aiProcessingQueue,
    incidentCreationQueue,
    communityProcessingQueue,
    closeQueues: closeBullQueues
  } = queueModule;

  closeQueues = closeBullQueues;

  await connectDB();
  await connectRedis();

  // Upsert Cron Schedulers
  await newsIngestionQueue.upsertJobScheduler(
    "news-ingestion-schedule",
    {
      pattern: process.env.NEWS_INGESTION_CRON || "0 */6 * * *"
    },
    {
      name: "ingest-news",
      data: {}
    }
  );

  await aiProcessingQueue.upsertJobScheduler(
    "ai-processing-schedule",
    {
      pattern: process.env.AI_PROCESSING_CRON || "*/5 * * * *"
    },
    {
      name: "process-pending-batch",
      data: {}
    }
  );

  const newsCounts = await newsIngestionQueue.getJobCounts("waiting", "active");
  const databaseIsEmpty = (await RawArticle.exists({})) === null;
  const shouldBootstrapNews = process.env.NEWS_BOOTSTRAP_ENABLED !== "false";
  if (shouldBootstrapNews && (databaseIsEmpty || (newsCounts.waiting === 0 && newsCounts.active === 0))) {
    // A completed BullMQ job retains its ID for a day. A unique ID is required
    // here so a worker restart in the same hour actually performs a fresh fetch.
    const bootstrapId = `bootstrap-ingest-${Date.now()}`;
    console.log(`Enqueueing bootstrap news ingestion job (${databaseIsEmpty ? "empty database" : "worker startup"})...`);
    await newsIngestionQueue.add("ingest-news", {}, { jobId: bootstrapId });
  }

  const aiCounts = await aiProcessingQueue.getJobCounts("waiting", "active");
  if (aiCounts.waiting === 0 && aiCounts.active === 0) {
    console.log("Enqueueing initial AI processing batch job...");
    await aiProcessingQueue.add("process-pending-batch", {}, { jobId: "initial-process-pending-batch" });
  }

  async function enqueueIncidentIfEligible(result) {
    if (
      !result?.processed ||
      !result.isDisaster ||
      !result.locationName ||
      !result.extractionId
    ) {
      return false;
    }

    await incidentCreationQueue.add(
      "create-incident",
      { extractionId: result.extractionId },
      {
        jobId: `incident-${result.extractionId}`
      }
    );

    return true;
  }

  // 1. News Ingestion Worker
  newsWorker = new Worker(
    "news-ingestion",
    async (job) => {
      console.log(`Starting news ingestion job ${job.id}`);
      const summary = await ingestNews();

      const aiJobs = await Promise.all(
        summary.insertedArticleIds.map((rawArticleId) =>
          aiProcessingQueue.add(
            "process-article",
            { rawArticleId },
            {
              jobId: `ai-${rawArticleId}`
            }
          )
        )
      );

      return {
        ...summary,
        aiJobsEnqueued: aiJobs.length
      };
    },
    {
      connection: bullConnection,
      concurrency: 1
    }
  );

  newsWorker.on("completed", (job, result) => {
    console.log(`News job ${job.id} completed:`, result);
  });

  newsWorker.on("failed", (job, error) => {
    console.error(`News job ${job?.id} failed:`, error.message);
  });

  // 2. AI Processing Worker
  aiWorker = new Worker(
    "ai-processing",
    async (job) => {
      if (job.name === "process-pending-batch") {
        const batch = await processPendingBatch();
        const incidentResults = await Promise.all(
          batch.results.map(enqueueIncidentIfEligible)
        );

        return {
          ...batch,
          incidentJobsEnqueued: incidentResults.filter(Boolean).length
        };
      }

      if (job.name === "process-article") {
        const result = await processArticleById(job.data.rawArticleId);

        return {
          ...result,
          incidentJobsEnqueued: (await enqueueIncidentIfEligible(result)) ? 1 : 0
        };
      }

      throw new Error(`Unsupported AI job: ${job.name}`);
    },
    {
      connection: bullConnection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 8000
      }
    }
  );

  aiWorker.on("completed", (job, result) => {
    console.log(`AI job ${job.id} completed:`, result);
  });

  aiWorker.on("failed", (job, error) => {
    console.error(`AI job ${job?.id} failed:`, error.message);
  });

  // 3. Incident Creation Worker
  incidentWorker = new Worker(
    "incident-creation",
    async (job) => {
      if (job.name !== "create-incident") {
        throw new Error(`Unsupported incident job: ${job.name}`);
      }

      const result = await createIncidentFromExtraction(job.data.extractionId);

      if (result.created || result.merged) {
        await invalidateIncidentsCache();
      }

      return result;
    },
    {
      connection: bullConnection,
      concurrency: 1
    }
  );

  incidentWorker.on("completed", (job, result) => {
    console.log(`Incident job ${job.id} completed:`, result);
  });

  incidentWorker.on("failed", (job, error) => {
    console.error(`Incident job ${job?.id} failed:`, error.message);
  });

  // 4. Community Processing Worker
  communityWorker = new Worker(
    "community-processing",
    async (job) => {
      console.log(`Processing community job ${job.id} (${job.name})`);
      if (job.name === "process-community-report") {
        const { input, reporterKey } = job.data;
        const result = await createCommunityReport(input, reporterKey);
        return result;
      }
      throw new Error(`Unsupported community job: ${job.name}`);
    },
    {
      connection: bullConnection,
      concurrency: 2
    }
  );

  communityWorker.on("completed", (job, result) => {
    console.log(`Community job ${job.id} completed:`, result);
  });

  communityWorker.on("failed", (job, error) => {
    console.error(`Community job ${job?.id} failed:`, error.message);
  });

  console.log("BullMQ pipeline workers (News, AI, Incident, Community) are active");
}

async function shutdown(signal) {
  console.log(`Received ${signal}. Closing worker connections...`);

  await Promise.allSettled([
    newsWorker?.close(),
    aiWorker?.close(),
    incidentWorker?.close(),
    communityWorker?.close(),
    closeQueues()
  ]);

  if (redisClient.isOpen) {
    await redisClient.quit();
  }

  await mongoose.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startWorker().catch((error) => {
  console.error("Worker failed to start:", error.message);
  process.exit(1);
});
