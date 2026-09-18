import { GoogleGenAI } from "@google/genai";
import RawArticle from "../models/rawArticle.model.js";
import AiExtraction from "../models/aiExtraction.model.js";
import {
  acquireAiRequest,
  activateAiCooldown,
  isQuotaError
} from "./aiQuota.service.js";

const MODEL_NAME = process.env.AI_MODEL_NAME
const PROMPT_VERSION = process.env.AI_PROMPT_VERSION
const MAX_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS || 3);

const genAI = new GoogleGenAI({
  apiKey : process.env.GEMINI_API_KEY
});

function removeCodeFences(text){
  return text.replace(/```json|```/g, "").trim();
}

export function parseExtraction(text){
  const parsed = JSON.parse(removeCodeFences(text));
  if(typeof parsed.isDisaster !== "boolean"){
    throw new Error("AI response is missing a boolean isDisaster Field");
  }

  const confidence = Number(parsed.confidence);

  if(Number.isNaN(confidence) || confidence<0 || confidence >1){
    throw new Error("AI response has an invalid confidence value");
  }

  const allowedLocationPrecisions = [
    "city",
    "region",
    "country",
    "unknown"
  ];

  const locationPrecision =
    parsed.locationPrecision || "unknown";

  if (!allowedLocationPrecisions.includes(locationPrecision)) {
    throw new Error("AI response has an invalid locationPrecision value");
  }

  return {
    result: {
      isDisaster: parsed.isDisaster,
      disasterType: parsed.disasterType || null,
      locationName: parsed.locationName || null,
      locationPrecision,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
      severity: parsed.severity || null,
      summary: parsed.summary || null
    },
    confidence
  };
}

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
        status: "processing", //change the status to processing
        lastError: null
      },
      $inc: {
        attempts: 1 // inc means incemeent
      }
    },
    {
      new: true, //return the document after the modifications are done
      sort: {
        createdAt: 1 //first in first out
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
    const quota = await acquireAiRequest();

    if (!quota.allowed) {
      article.status = "pending";
      article.lastError = `AI processing paused: ${quota.reason}`;
      await article.save();

      return {
        processed: false,
        articleId: article._id.toString(),
        reason: quota.reason,
        retryAfterSeconds: quota.retryAfterSeconds || null
      };
    }

    const prompt = `
You are classifying a news article for a disaster-monitoring system.

Return ONLY a valid JSON object. No markdown. No explanation.

Use exactly this shape:
{
  "isDisaster": true,
  "disasterType": "flood",
  "locationName": "City, Region, Country",
  "locationPrecision": "city",
  "occurredAt": "2026-08-22T05:53:00.000Z",
  "severity": "low",
  "summary": "One short factual sentence.",
  "confidence": 0.0
}

Rules:
- isDisaster must be true or false.
- A disaster includes natural disasters, major accidents, outbreaks, mass-casualty events, or active armed attacks.
- Ordinary politics, sports, food, business, celebrity, and opinion news are not disasters.
- Use null for unknown fields.
- severity must be one of: low, moderate, high, critical, or null.
- confidence must be a number from 0 to 1.
- Use the event time if clearly stated; otherwise use the article publication time.
- Reserve confidence 1.0 for cases where the article directly and unambiguously states the event type, location, and impact.
- Use lower confidence when the event location, severity, or facts are incomplete.

Location rules:
- Extract the event location, not the publisher's; use the most specific place explicitly supported: neighborhood → city → district → state/province → country.
- If only a country is known, use it as locationName; never leave locationName null merely because a city is unavailable. Use null only when no trustworthy event geography exists.
- Article metadata country is supporting context only; never assume it is the event location. Never invent, guess, or infer a specific location from indirectly mentioned conflicts/countries.
- locationPrecision must be city, region, country, or unknown: city = named city/town/locality; region = state/province/district/island/sea/similarly broad area; country = best trustworthy country; unknown = locationName is null.

Article:
${JSON.stringify(
  {
    title: article.title,
    description: article.description,
    publishedAt: article.publishedAt,
    country: article.country,
    sourceName: article.rawPayload?.source_name,
    url: article.canonicalUrl
  },
  null,
  2
)}
`;

    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });

    const rawResponse = response.text.trim();
    const { result, confidence } = parseExtraction(rawResponse);

    const extractionStatus = result.isDisaster
      ? "success"
      : "not_a_disaster";

    const extraction = await AiExtraction.create({
      rawArticleId: article._id,
      model: MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      rawResponse,
      result,
      confidence,
      status: extractionStatus
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
      locationName: result.locationName
    };
  } catch (error) {
    if (isQuotaError(error)) {
      const cooldownSeconds = await activateAiCooldown(error);
      article.status = "pending";
      article.lastError = "AI provider quota exhausted";
      await article.save();

      return {
        processed: false,
        articleId: article._id.toString(),
        reason: "provider_quota",
        retryAfterSeconds: cooldownSeconds
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
