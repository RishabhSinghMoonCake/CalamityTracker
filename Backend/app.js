import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import router from './routes/maps.routes.js';
import apiRouter from './routes/apiRoutes.js';
import redisClient from './config/redis.js';
const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "256kb" }));
//middlewares
app.use(
  cors({
    exposedHeaders: ["X-Cache", "X-Response-Time"]
  })
);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});

app.get('/api/ready', async (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = redisClient.isReady;

  const payload = {
    status: mongoReady && redisReady ? 'ready' : 'not_ready',
    dependencies: {
      mongodb: mongoReady ? 'up' : 'down',
      redis: redisReady ? 'up' : 'down'
    }
  };

  return res.status(mongoReady && redisReady ? 200 : 503).json(payload);
});
app.use('/maps' , router)
app.use('/api', apiRouter);

export default app;
