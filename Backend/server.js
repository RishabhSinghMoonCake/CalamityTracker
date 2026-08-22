import http from "http";
import app from "./app.js";
import connectDB from "./db/db.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    //await import("./cron/disaster.worker.js");

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
}

startServer();