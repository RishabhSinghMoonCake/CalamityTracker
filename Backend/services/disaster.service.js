import axios from "axios";
import Incident from "../models/incident.model.js";

const RELEVANT_NEWS_PATTERN = /\b(flood(?:ing|ed)?|earthquake|tremor|seismic|wildfire|bushfire|forest fire|hurricane|typhoon|cyclone|tropical storm|volcano|volcanic eruption|landslide|mudslide|disease outbreak|epidemic|pandemic|industrial accident|chemical spill|chemical explosion|transport accident|train derailment|plane crash|active shooter|terrorist attack|mass casualty|missile attack|airstrike|tornado|tsunami|drought|famine|avalanche|blizzard|heatwave|monsoon|storm surge|radiation|nuclear|sinkhole|bioterrorism|riot|civil unrest|bombing|hostage|casualty|fatalities|evacuation|emergency|crisis|disaster)\b/i;

export function isRelevantNewsArticle(article) {
  return RELEVANT_NEWS_PATTERN.test(`${article?.title || ""} ${article?.description || ""}`);
}

export function normalizeNewsResponses(allResponses) {
  const articlesByUrl = new Map();

  for (const data of allResponses) {
    const articles = data?.results;

    if (!Array.isArray(articles)) {
      continue;
    }

    for (const item of articles) {
      if (!item.link || !item.title || !item.pubDate) {
        continue;
      }
      if (!isRelevantNewsArticle(item)) {
        continue;
      }

      const publishedAt = new Date(
        `${item.pubDate.replace(" ", "T")}Z`
      );

      if (Number.isNaN(publishedAt.getTime())) {
        continue;
      }

      articlesByUrl.set(item.link, {
        source: "newsdata",
        sourceArticleId: item.article_id || null,
        canonicalUrl: item.link,
        title: item.title.trim(),
        description: item.description?.trim() || "",
        publishedAt,
        country: item.country?.[0] || "unknown",
        rawPayload: item
      });
    }
  }

  return [...articlesByUrl.values()].sort(
    (a, b) => b.publishedAt - a.publishedAt
  );
}

export async function fetchNews({ httpClient = axios, queryList = null } = {}) {
  const defaultQueries = [
    "flood",
    "earthquake",
    "wildfire",
    "hurricane OR typhoon OR cyclone OR tropical storm",
    "volcano",
    "landslide",
    "disease outbreak",
    "industrial accident",
    "major accident",
    "transport accident",
    "active shooter",
    "terrorist attack",
    "mass casualty",
    "war",
    "missile",
    "attack"
  ];
  const configuredQueries = process.env.NEWS_QUERIES?.split("|")
    .map((query) => query.trim()).filter(Boolean);
  const requestedLimit = Number(process.env.NEWS_MAX_QUERIES_PER_RUN || defaultQueries.length);
  const availableQueries = queryList || (configuredQueries?.length ? configuredQueries : defaultQueries);
  const queryCount = Math.min(Math.max(requestedLimit, 1), 10, availableQueries.length);
  const rotationMinutes = Math.max(Number(process.env.NEWS_QUERY_ROTATION_MINUTES || 360), 1);
  const rotationWindow = Math.floor(Date.now() / (rotationMinutes * 60 * 1000));
  const rotationOffset = rotationWindow % availableQueries.length;
  const queries = Array.from({ length: queryCount }, (_, index) => availableQueries[(rotationOffset + index) % availableQueries.length]);
  const requestDelayMs = Number(process.env.NEWS_REQUEST_DELAY_MS || 1200);
  const requestTimeoutMs = Number(process.env.NEWS_REQUEST_TIMEOUT_MS || 30000);
  const requestRetries = Math.min(Math.max(Number(process.env.NEWS_REQUEST_RETRIES || 2), 0), 3);
  const retryDelayMs = Number(process.env.NEWS_RETRY_DELAY_MS || requestDelayMs);

  const allResponses = [];
  const failures = [];

  console.log(`[fetchNews] Starting to fetch news with queries: ${queries.join(' | ')}`);

  for(const query of queries)
  {
    console.log(`[fetchNews] Fetching news for query: "${query}"`);
    let response;
    let lastError;
    for (let attempt = 0; attempt <= requestRetries; attempt++) {
      try {
        console.log(`[fetchNews] Request ${attempt + 1}/${requestRetries + 1} to ${process.env.NEWS_API_URL} (API key ${process.env.NEWS_API_KEY ? "PRESENT" : "MISSING"})`);
        response = await httpClient.get(process.env.NEWS_API_URL, {
          params: { apikey: process.env.NEWS_API_KEY, q: query },
          timeout: requestTimeoutMs
        });
        break;
      } catch (error) {
        lastError = error;
        console.error(`[fetchNews] Attempt ${attempt + 1} Error Details for "${query}":`, {
           message: error.message,
           status: error.response?.status,
           data: error.response?.data,
           code: error.code
        });
        if (attempt < requestRetries) {
          console.warn(`[fetchNews] Waiting ${retryDelayMs}ms before retrying "${query}"`);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    if (response) {
      const resultCount = response.data?.results?.length || 0;
      console.log(`[fetchNews] Success! Received ${resultCount} upstream articles for query "${query}"`);
      allResponses.push(response.data);
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    } else {
      console.warn(`[fetchNews] News request failed for "${query}": ${lastError?.message || lastError?.response?.statusText || "unknown error"}`);
      failures.push(`${query}: ${lastError?.response?.status || lastError?.code || "request error"}`);
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    }
  }

  if (allResponses.length === 0) {
    throw new Error(`News provider failed for every query (${failures.join("; ") || "no responses"})`);
  }

  const normalizedArticles = normalizeNewsResponses(allResponses);

  if (normalizedArticles.length === 0 && failures.length > 0) {
    throw new Error(`No relevant articles received and ${failures.length}/${queries.length} NewsData queries failed (${failures.join("; ")})`);
  }

  console.log(`[fetchNews] Completed fetching. Normalized ${normalizedArticles.length} relevant articles from ${allResponses.length}/${queries.length} successful queries.`);
  return normalizedArticles;
}

export async function getProcessedDisasters() {
  const incidents = await Incident.find({ status: { $in: ["candidate", "active"] } })
    .sort({ lastUpdatedAt: -1 }).limit(500).lean();
  return incidents.map((incident) => ({
    disaster_location: incident.locationName,
    article_link: incident.evidenceArticles?.[0]?.toString() || "",
    disaster_datetime: incident.occurredAt,
    disaster_type: incident.type,
    lat: incident.location.coordinates[1],
    lng: incident.location.coordinates[0]
  }));
}
