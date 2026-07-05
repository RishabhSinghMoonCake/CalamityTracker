import express from 'express';
import connectDB from './db/db.js';
import cors from 'cors';
import router from './routes/maps.routes.js';
import apiRouter from './routes/apiRoutes.js';
const app = express();

// Middleware to parse JSON requests
app.use(express.json());
//middlewares
app.use(cors());

//connect to MongoDB
connectDB();
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});
app.use('/maps' , router)
app.use('/api', apiRouter);

export default app;
