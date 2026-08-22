import { ingestNews } from "../services/newsIngestion.service.js";

export async function ingestNewsNow(req, res) {
  try {
    const summary = await ingestNews();

    res.status(200).json({
      message: "News ingestion completed",
      ...summary
    });
  } catch (error) {
    res.status(500).json({
      message: "News ingestion failed",
      error: error.message
    });
  }
}