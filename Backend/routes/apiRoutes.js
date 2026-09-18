import express from 'express';
import { addDisasterDB, getDisastersDB } from '../controllers/database.controller.js';
import { ingestNewsNow } from "../controllers/newsIngestion.controller.js";

import {
  processOneArticle,
  processArticleBatch
} from "../controllers/aiProcessing.controller.js";
import { createIncident, getIncidents } from '../controllers/incident.controller.js';
import { submitCommunityReport } from "../controllers/communityReport.controller.js";
import { streamIncidentEvents } from "../controllers/realtime.controller.js";

const apiRouter = express.Router();

apiRouter.get('/get-calamities-db' , getDisastersDB)
apiRouter.post('/add-calamity-db' , addDisasterDB)
apiRouter.get("/incidents", getIncidents);
apiRouter.get("/events/incidents", streamIncidentEvents);
apiRouter.post("/reports", submitCommunityReport);


apiRouter.post("/admin/ingest-news", ingestNewsNow);
apiRouter.post("/admin/process-one-article", processOneArticle);
apiRouter.post("/admin/process-article-batch", processArticleBatch);
apiRouter.post("/admin/create-incident", createIncident);
export default apiRouter;
