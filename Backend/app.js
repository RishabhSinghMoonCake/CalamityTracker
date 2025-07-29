import express from 'express';
import connectDB from './db/db.js';
import cors from 'cors';
import router from './routes/maps.routes.js';
import apiRouter from './routes/apiRoutes.js';
import morgan from 'morgan';
const app = express();

// Middleware to parse JSON requests
app.use(express.json());
app.use(morgan('dev'))
//middlewares
app.use(cors());

//connect to MongoDB
connectDB();

app.use('/maps' , router)
app.use('/api', apiRouter);

export default app;