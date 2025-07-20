import express from 'express';
import connectDB from './db/db.js';
import axios from 'axios';
import main from './Gemini/gemini.js';
const app = express();

// Middleware to parse JSON requests
app.use(express.json());

//connect to MongoDB
connectDB();



app.get('/', (req, res) => {
  //fetchNews().catch(console.error);
  main();
  res.send('Hello, World!');
});

export default app;