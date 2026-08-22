import express from 'express';
import main from '../controllers/gemini.controller.js';
import { addDisasterDB, getDisastersDB } from '../controllers/database.controller.js';
import { ingestNewsNow } from "../controllers/newsIngestion.controller.js";

import { processOneArticle } from "../controllers/aiProcessing.controller.js";

const apiRouter = express.Router();

apiRouter.get('/calamities', main);
apiRouter.get('/get-calamities-db' , getDisastersDB)
apiRouter.post('/add-calamity-db' , addDisasterDB)
apiRouter.post("/admin/ingest-news", ingestNewsNow);
apiRouter.post("/admin/process-one-article", processOneArticle);
export default apiRouter;