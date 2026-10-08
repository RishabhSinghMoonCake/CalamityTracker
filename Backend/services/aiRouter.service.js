import { GoogleGenAI } from "@google/genai";
import {
  acquireAiRequest,
  activateProviderCooldown,
  checkProviderAvailability,
  isQuotaError
} from "./aiQuota.service.js";

const DEFAULT_PROMPT_VERSION = process.env.AI_PROMPT_VERSION || "v2";

/**
 * Builds the classification prompt for an article.
 */
export function buildClassificationPrompt(article) {
  return `
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
    sourceName: article.sourceName || article.rawPayload?.source_name,
    url: article.canonicalUrl || article.url
  },
  null,
  2
)}
`;
}

function removeCodeFences(text) {
  return text.replace(/```json|```/g, "").trim();
}

/**
 * Validates and normalizes the parsed extraction.
 */
export function parseExtraction(text) {
  let parsed;
  try {
    parsed = JSON.parse(removeCodeFences(text));
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}. Raw output: ${text.slice(0, 200)}`);
  }

  if (typeof parsed.isDisaster !== "boolean") {
    throw new Error("AI response is missing a boolean isDisaster field");
  }

  const confidence = Number(parsed.confidence);
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI response has an invalid confidence value (must be 0-1)");
  }

  const allowedLocationPrecisions = ["city", "region", "country", "unknown"];
  const locationPrecision = parsed.locationPrecision || "unknown";

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

/**
 * Google Gemini Provider
 */
export class GeminiProvider {
  constructor() {
    this.name = "gemini";
    this.modelName = process.env.AI_MODEL_NAME || "gemini-2.5-flash";
    this.apiKey = process.env.GEMINI_API_KEY;
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey !== "replace_me");
  }

  async classify(article, prompt) {
    if (!this.client) {
      throw new Error("Gemini API key is not configured");
    }

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: prompt
    });

    const rawResponse = response.text?.trim() || "";
    const parsed = parseExtraction(rawResponse);

    return {
      ...parsed,
      rawResponse,
      provider: this.name,
      model: this.modelName
    };
  }
}

/**
 * OpenAI-Compatible Provider (Works with OpenAI, Groq, OpenRouter, DeepSeek, Local Ollama)
 */
export class OpenAICompatibleProvider {
  constructor() {
    this.name = "openai";
    this.apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    this.baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.modelName = process.env.OPENAI_MODEL_NAME || "gpt-4o-mini";
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey !== "replace_me");
  }

  async classify(article, prompt) {
    if (!this.isConfigured()) {
      throw new Error("OpenAI-compatible API key is not configured");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: "You are a disaster classification engine. Return only strict JSON according to instructions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(`OpenAI-compatible provider error (${response.status}): ${errorBody}`);
      error.status = response.status;
      error.code = response.status;
      throw error;
    }

    const data = await response.json();
    const rawResponse = data.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseExtraction(rawResponse);

    return {
      ...parsed,
      rawResponse,
      provider: this.name,
      model: this.modelName
    };
  }
}

/**
 * Mock / Deterministic Provider for Offline Testing and CI
 */
export class MockProvider {
  constructor() {
    this.name = "mock";
    this.modelName = "mock-classifier-v1";
  }

  isConfigured() {
    return true;
  }

  async classify(article) {
    const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
    const disasterKeywords = [
      { type: "flood", regex: /\b(flood|flooding|inundated|submerged)\b/ },
      { type: "wildfire", regex: /\b(wildfire|forest fire|bushfire|blaze)\b/ },
      { type: "earthquake", regex: /\b(earthquake|tremor|seismic|richter)\b/ },
      { type: "landslide", regex: /\b(landslide|mudslide)\b/ },
      { type: "storm", regex: /\b(storm|cyclone|hurricane|typhoon|tornado)\b/ },
      { type: "tsunami", regex: /\b(tsunami|tidal wave)\b/ }
    ];

    let matchedType = null;
    for (const { type, regex } of disasterKeywords) {
      if (regex.test(text)) {
        matchedType = type;
        break;
      }
    }

    const isDisaster = Boolean(matchedType);
    const location = article.country || "Bihar, India";
    const rawResponse = JSON.stringify({
      isDisaster,
      disasterType: matchedType,
      locationName: isDisaster ? location : null,
      locationPrecision: isDisaster ? "region" : "unknown",
      occurredAt: article.publishedAt ? new Date(article.publishedAt).toISOString() : new Date().toISOString(),
      severity: isDisaster ? "moderate" : null,
      summary: isDisaster ? `${matchedType} reported in ${location}.` : "Non-disaster news event.",
      confidence: isDisaster ? 0.85 : 0.95
    });

    const parsed = parseExtraction(rawResponse);
    return {
      ...parsed,
      rawResponse,
      provider: this.name,
      model: this.modelName
    };
  }
}

/**
 * Multi-AI Routing Engine
 */
export class MultiAiRouter {
  constructor() {
    this.providers = new Map([
      ["gemini", new GeminiProvider()],
      ["openai", new OpenAICompatibleProvider()],
      ["mock", new MockProvider()]
    ]);
  }

  getProvider(name) {
    return this.providers.get(name.toLowerCase());
  }

  getRoutingChain() {
    const primary = (process.env.AI_PRIMARY_PROVIDER || "gemini").trim();
    const fallbacks = (process.env.AI_FALLBACK_PROVIDERS || "openai,mock")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    return [...new Set([primary, ...fallbacks])];
  }

  async classify(article) {
    const routingChain = this.getRoutingChain();
    const prompt = buildClassificationPrompt(article);
    const errors = [];
    const startTime = Date.now();
    let fallbackReason = null;

    for (const providerName of routingChain) {
      const provider = this.getProvider(providerName);
      if (!provider) continue;

      if (!provider.isConfigured()) {
        continue;
      }

      // Check circuit breaker
      const availability = await checkProviderAvailability(providerName);
      if (!availability.available) {
        fallbackReason = `Circuit breaker active for ${providerName} (TTL: ${availability.cooldownTtl}s)`;
        errors.push({ provider: providerName, reason: fallbackReason });
        continue;
      }

      // Check quota
      const quota = await acquireAiRequest(providerName);
      if (!quota.allowed) {
        fallbackReason = `Quota exhausted for ${providerName}: ${quota.reason}`;
        errors.push({ provider: providerName, reason: fallbackReason });
        continue;
      }

      try {
        const result = await provider.classify(article, prompt);
        return {
          ...result,
          executionTimeMs: Date.now() - startTime,
          promptVersion: DEFAULT_PROMPT_VERSION,
          fallbackReason: errors.length > 0 ? errors.map((e) => `${e.provider}: ${e.reason}`).join(" | ") : null
        };
      } catch (error) {
        console.warn(`AI Provider [${providerName}] failed:`, error.message);
        if (isQuotaError(error)) {
          const cooldownSeconds = await activateProviderCooldown(providerName, error);
          fallbackReason = `${providerName} rate-limit 429 triggered cooldown for ${cooldownSeconds}s`;
        } else {
          fallbackReason = `${providerName} error: ${error.message}`;
        }
        errors.push({ provider: providerName, reason: fallbackReason });
      }
    }

    // If all providers failed, throw aggregated error
    const errorDetails = errors.map((e) => `[${e.provider}] ${e.reason}`).join("; ");
    throw new Error(`All AI routing providers failed or exhausted quota: ${errorDetails || "No available providers"}`);
  }
}

export const aiRouter = new MultiAiRouter();
