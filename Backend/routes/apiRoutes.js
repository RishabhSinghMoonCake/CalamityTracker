import express from 'express';
import main from '../controllers/gemini.controller.js';
import { addDisasterDB, getDisastersDB } from '../controllers/database.controller.js';

const apiRouter = express.Router();

apiRouter.get('/calamities', main);
apiRouter.get('/get-calamities-db' , getDisastersDB)
apiRouter.post('/add-calamity-db' , addDisasterDB)

export default apiRouter;