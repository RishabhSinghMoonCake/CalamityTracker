import { processNextPendingArticle } from "../services/aiProcessing.service.js";

export async function processOneArticle(req, res) {
  try {
    const result = await processNextPendingArticle();

    res.status(200).json(result);
  } catch (error) {
    console.error("AI processing failed:", error.message);

    res.status(500).json({
      message: "AI processing failed",
      error: error.message
    });
  }
}