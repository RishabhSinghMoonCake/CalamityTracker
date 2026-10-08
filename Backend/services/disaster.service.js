import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

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

export async function fetchNews() {
    const queries = [
    "flood OR earthquake OR wildfire OR landslide",
    "cyclone OR hurricane OR typhoon OR storm  OR war",
    "volcanic eruption OR tsunami OR major accident OR attack"
  ];

  const allResponses = [];

  console.log(`[fetchNews] Starting to fetch news with queries: ${queries.join(' | ')}`);

  for(const query of queries)
  {
    console.log(`[fetchNews] Fetching news for query: "${query}"`);
    try{
      console.log(`[fetchNews] Making request to: ${process.env.NEWS_API_URL} with apikey: ${process.env.NEWS_API_KEY ? "PRESENT" : "MISSING"}`);
      const response = await axios.get(process.env.NEWS_API_URL,{
        params:{
          apikey: process.env.NEWS_API_KEY,
          q: query
        },
        timeout: 10000
      });

      const resultCount = response.data?.results?.length || 0;
      console.log(`[fetchNews] Success! Received ${resultCount} articles for query "${query}"`);

      allResponses.push(response.data);

      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch(error){
      console.warn(`[fetchNews] News request failed for "${query}": ${error.message}`);
      if (error.response) {
        console.warn(`[fetchNews] Response status: ${error.response.status}`);
        console.warn(`[fetchNews] Response data:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }

  const normalizedArticles = normalizeNewsResponses(allResponses);

  console.log(`[fetchNews] Completed fetching. Normalized ${normalizedArticles.length} unique articles across all queries.`);
  return normalizedArticles;
}

export async function getProcessedDisasters() {
  const articlesInput = await fetchNews();

  if (!articlesInput.length) {
    console.log("No news articles found.");
    return [];
  }

  const prompt = `
    Extract structured disaster information from the following news articles.

    Each article is already disaster-related.

    For each article return:

    [
      {
        "disaster_location": "string",
        "article_link": "string",
        "disaster_datetime": "YYYY-MM-DD HH:MM:SS",
        "disaster_type": "string",
        "lat": 0.0,
        "lng": 0.0
      }
    ]

    Rules:
    1. Process every article.
    2. Extract the most specific location possible.
    3. Estimate coordinates from the location.
    4. Use article link exactly.
    5. Use pub_date and pub_time if no better event time is available.
    6. Keep disaster_type short like:
      flood, wildfire, earthquake, landslide, attack, outbreak, storm, accident.
    7. Always return valid lat/lng numbers.
    8. Return only JSON array.
    9. No markdown.
    10. No explanation.

    Articles:
    ${JSON.stringify(articlesInput, null, 2)}
    `;

  let result;
  let retries = 3;

  while (retries > 0) {
    try {
      result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      break;
    } catch (error) {
      retries--;
      console.log(`Gemini retrying... (${retries} left)`);

      if (retries === 0) {
        console.error("Gemini failed completely:", error.message);
        return [];
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  let text = result.text.trim();
  text = text.replace(/```json|```/g, "").trim();

  console.log("Gemini raw output:", text);

  try {
    const parsed = JSON.parse(text);

    const fixedDisasters = parsed
      .map((d) => ({
        ...d,
        lat: Number(d.lat),
        lng: Number(d.lng)
      }))
      .filter(
        (d) =>
          d.disaster_location &&
          d.article_link &&
          d.disaster_datetime &&
          d.disaster_type &&
          !isNaN(d.lat) &&
          !isNaN(d.lng)
      );

    console.log(`Valid disasters extracted: ${fixedDisasters.length}`);

    return fixedDisasters;
  } catch (error) {
    console.error("Bad Gemini JSON:", text);
    return [];
  }
}
