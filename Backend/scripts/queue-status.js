import {
  aiProcessingQueue,
  closeQueues,
  incidentCreationQueue,
  newsIngestionQueue
} from "../queues/pipeline.queues.js";

async function getQueueStatus(queue) {
  return queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed"
  );
}

try {
  const status = {
    newsIngestion: await getQueueStatus(newsIngestionQueue),
    aiProcessing: await getQueueStatus(aiProcessingQueue),
    incidentCreation: await getQueueStatus(incidentCreationQueue)
  };

  console.log(JSON.stringify(status, null, 2));
} finally {
  await closeQueues();
}
