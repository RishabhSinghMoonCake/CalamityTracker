import express from 'express';
import main from '../controllers/gemini.controller.js';
import { addDisasterDB, getDisastersDB } from '../controllers/database.controller.js';
import { ingestNewsNow } from "../controllers/newsIngestion.controller.js";

import { processOneArticle } from "../controllers/aiProcessing.controller.js";
import { processArticleBatch } from '../services/aiProcessing.service.js';
import { createIncident, getIncidents } from '../controllers/incident.controller.js';

const apiRouter = express.Router();

apiRouter.get('/calamities', main);
apiRouter.get('/get-calamities-db' , getDisastersDB)
apiRouter.post('/add-calamity-db' , addDisasterDB)
apiRouter.get("/incidents", getIncidents);


apiRouter.post("/admin/ingest-news", ingestNewsNow);
apiRouter.post("/admin/process-one-article", processOneArticle);
apiRouter.post("/admin/process-article-batch", processArticleBatch);
apiRouter.post("/admin/create-incident", createIncident);
export default apiRouter;