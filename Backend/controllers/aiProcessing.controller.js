import {
  processNextPendingArticle,
  processPendingBatch
} from "../services/aiProcessing.service.js";

export async function processOneArticle(req, res) {
  try {
    const result = await processNextPendingArticle();

    res.status(200).json(result);
  } catch (error) {
    console.error("AI processing failed:", error.message);

    res.status(500).json({
      message: "AI processing failed"
    });
  }
}

export async function processArticleBatch(req, res) {
  try {
    const result = await processPendingBatch();

    return res.status(200).json(result);
  } catch (error) {
    console.error("AI batch processing failed:", error.message);

    return res.status(500).json({
      message: "AI batch processing failed"
    });
  }
}
