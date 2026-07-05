import app from "./app.js";
import http from "http";
import "./cron/disaster.worker.js";


const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
