import RawArticle from "../models/rawArticle.model.js";
import AiExtraction from "../models/aiExtraction.model.js";
import { aiRouter, parseExtraction } from "./aiRouter.service.js";
import { isQuotaError, activateProviderCooldown } from "./aiQuota.service.js";

export { parseExtraction };

const MAX_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS || 3);

export async function processNextPendingArticle(rawArticleId = null) {
  const article = await RawArticle.findOneAndUpdate(
    {
      ...(rawArticleId ? { _id: rawArticleId } : {}),
      $or: [
        { status: "pending" },
        {
          status: "failed",
          attempts: { $lt: MAX_ATTEMPTS }
        }
      ]
    },
    {
      $set: {
        status: "processing",
        lastError: null
      },
      $inc: {
        attempts: 1
      }
    },
    {
      new: true,
      sort: {
        createdAt: 1
      }
    }
  );

  if (!article) {
    return {
      processed: false,
      message: rawArticleId
        ? "Article is not eligible for processing"
        : "No pending articles available"
    };
  }

  try {
    const routedResult = await aiRouter.classify(article);
    const { result, confidence, rawResponse, provider, model, promptVersion, executionTimeMs, fallbackReason } = routedResult;

    const extractionStatus = result.isDisaster
      ? "success"
      : "not_a_disaster";

    const extraction = await AiExtraction.create({
      rawArticleId: article._id,
      model,
      provider: provider || "gemini",
      promptVersion: promptVersion || "v2",
      rawResponse,
      result,
      confidence,
      status: extractionStatus,
      executionTimeMs: executionTimeMs || 0,
      fallbackReason: fallbackReason || null
    });

    article.status = result.isDisaster ? "processed" : "skipped";
    article.processedAt = new Date();
    await article.save();

    return {
      processed: true,
      articleId: article._id,
      articleTitle: article.title,
      status: article.status,
      isDisaster: result.isDisaster,
      extractionId: extraction._id.toString(),
      locationName: result.locationName,
      provider,
      model,
      fallbackReason
    };
  } catch (error) {
    if (isQuotaError(error)) {
      await activateProviderCooldown("gemini", error);
      article.status = "pending";
      article.lastError = `AI provider quota exhausted: ${error.message}`;
      await article.save();

      return {
        processed: false,
        articleId: article._id.toString(),
        reason: "provider_quota",
        error: error.message
      };
    }

    article.status = "failed";
    article.lastError = error.message;
    await article.save();

    throw error;
  }
}

export async function processArticleById(rawArticleId) {
  if (!rawArticleId) {
    throw new Error("rawArticleId is required");
  }

  return processNextPendingArticle(rawArticleId);
}

export async function processPendingBatch() {
  const batchSize = Number(process.env.AI_BATCH_SIZE || 3);
  const results = [];

  for (let index = 0; index < batchSize; index++) {
    const result = await processNextPendingArticle();

    if (!result.processed) {
      break;
    }

    results.push(result);
  }

  return {
    requestedBatchSize: batchSize,
    processedCount: results.length,
    results
  };
}
