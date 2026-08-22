import { GoogleGenAI } from "@google/genai";
import RawArticle from "../models/rawArticle.model.js";
import AiExtraction from "../models/aiExtraction.model.js";

const MODEL_NAME = process.env.AI_MODEL_NAME
const PROMPT_VERSION = process.env.AI_PROMPT_VERSION
const MAX_ATTEMPTS = process.env.AI_MAX_ATTEMPTS

const genAI = new GoogleGenAI({
  apiKey : process.env.GEMINI_API_KEY
});

function removeCodeFences(text){
  return text.replace(/```json|```/g, "").trim();
}

function parseExtraction(text){
  const parsed = JSON.parse(removeCodeFences(text));
  if(typeof parsed.isDisaster !== "boolean"){
    throw new Error("AI response is missing a boolean isDisaster Field");
  }

  const confidence = Number(parsed.confidence);

  if(Number.isNaN(confidence) || confidence<0 || confidence >1){
    throw new Error("AI response has an invalid confidence value");
  }

  return {
    result: {
      isDisaster: parsed.isDisaster,
      disasterType: parsed.disasterType || null,
      locationName: parsed.locationName || null,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : null,
      severity: parsed.severity || null,
      summary: parsed.summary || null
    },
    confidence
  };
}

export async function processNextPendingArticle() {
  const article = await RawArticle.findOneAndUpdate(
    {
      $or: [
        { status: "pending" }, //either pending
        {
          status: "failed", //or failed but attempts is less than max attempts
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
      message: "No pending articles available"
    };
  }

  try {
    const prompt = `
You are classifying a news article for a disaster-monitoring system.

Return ONLY a valid JSON object. No markdown. No explanation.

Use exactly this shape:
{
  "isDisaster": true,
  "disasterType": "flood",
  "locationName": "City, Region, Country",
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
- Do not invent a location.

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

    await AiExtraction.create({
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
      isDisaster: result.isDisaster
    };
  } catch (error) {
    article.status = "failed";
    article.lastError = error.message;
    await article.save();

    throw error;
  }
}