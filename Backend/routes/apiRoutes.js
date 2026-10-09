import express from "express";
import { addDisasterDB, getDisastersDB } from "../controllers/database.controller.js";
import { ingestNewsNow } from "../controllers/newsIngestion.controller.js";
import {
  processOneArticle,
  processArticleBatch
} from "../controllers/aiProcessing.controller.js";
import { createIncident, getIncidents } from "../controllers/incident.controller.js";
import {
  submitCommunityReport,
  getPublicReports,
  getMyReports,
  corroborateReport,
  verifyReport
} from "../controllers/communityReport.controller.js";
import { streamIncidentEvents } from "../controllers/realtime.controller.js";
import {
  getQueueStatus,
  retryQueueJobs,
  getAiProvidersStatus
} from "../controllers/queue.controller.js";

const apiRouter = express.Router();

// Incidents & Map Feed
apiRouter.get("/incidents", getIncidents);
apiRouter.get("/events/incidents", streamIncidentEvents);

// Community Signals & Corroboration
apiRouter.post("/reports", submitCommunityReport);
apiRouter.get("/reports", getPublicReports);
apiRouter.get("/reports/mine", getMyReports);
apiRouter.post("/reports/:id/corroborate", corroborateReport);

// Admin & Moderation Endpoints
apiRouter.post("/admin/reports/:id/verify", verifyReport);
apiRouter.post("/admin/ingest-news", ingestNewsNow);
apiRouter.post("/admin/process-one-article", processOneArticle);
apiRouter.post("/admin/process-article-batch", processArticleBatch);
apiRouter.post("/admin/create-incident", createIncident);

// BullMQ & AI Observability Endpoints
apiRouter.get("/admin/queues", getQueueStatus);
apiRouter.post("/admin/queues/:name/retry-failed", retryQueueJobs);
apiRouter.get("/admin/ai/providers", getAiProvidersStatus);

// Legacy database routes
apiRouter.get("/get-calamities-db", getDisastersDB);
apiRouter.post("/admin/add-calamity-db", addDisasterDB);

export default apiRouter;
