
import express from 'express';
import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function fetchNews() {
  try {
    const keywords = [
      "flood",
      "earthquake",
      "wildfire",
      "hurricane OR typhoon OR cyclone OR tropical storm",
      "volcano",
      "landslide",
      "disease outbreak",
      "industrial accident",
      "chemical spill",
      "major accident",
      "transport accident",
      "active shooter",
      "terrorist attack",
      "mass casualty"
    ];

    const allResponses = await Promise.all(
      keywords.map(async (query) => {
        const url = `${process.env.NEWS_API_URL}?apikey=${process.env.NEWS_API_KEY}&q=${encodeURIComponent(query)}`;
        try {
          const response = await axios.get(url);
          return response.data;
        } catch (error) {
          console.warn(`Failed to fetch for "${query}": ${error.message}`);
          return null;
        }
      })
    );

    const output = [];

    for (const data of allResponses) {
      if (!data || data.status !== "success" || !Array.isArray(data.results)) continue;

      for (const item of data.results) {
        const { link, pubDate, country, title, description } = item;
        if (!link || !pubDate || !country || !title) continue;

        const [pub_date, pub_time = "00:00:00"] = pubDate.split(" ");

        output.push({
          link,
          pub_date,
          pub_time,
          location_country: country[0] || "unknown",
          content: `${title}. ${description || ""}`
        });
      }
    }

    console.log(`✅ Total filtered articles: ${output.length}`);
    return output;

  } catch (error) {
    console.error("❌ Error fetching news:", error.message);
    return [];
  }
}

async function main(req, res) {
  const articlesInput = await fetchNews();

  if (!articlesInput || articlesInput.length === 0) {
    console.log("⚠️ No articles found or parsed.");
    return res.json({ data: "[]" });
  }

  const prompt = `You are an expert news analyst specializing in identifying and cataloging global calamities and disasters. Your task is to review a given array of news article details. For each article, you must determine if it describes a natural or man-made calamity or disaster (e.g., earthquake, flood, hurricane, wildfire, major industrial accident, terrorist attack, widespread disease outbreak, etc.).

If an article *does not* correspond to a calamity or disaster, you must **completely ignore it** and *not* include it in the final output.

If an article *does* correspond to a calamity or disaster, you must:
1.  **Fetch and Analyze Article Content:** Access the provided \`link\` to the news article. Read and understand the article's full content to extract precise details about the disaster.
2.  **Extract Disaster Location:** Identify the most specific location mentioned in the article where the disaster occurred (e.g., "Lahaina, Maui, Hawaii," "Kyoto, Japan," "Northern Italy," "Amazon Rainforest"). Do not just use the \`location_country\` if a more specific location is available in the article content. If no specific location within the country is mentioned, use the provided \`location_country\`.
3.  **Extract Disaster Date and Time:** From the article's content, identify the most accurate date and, if available, the time of the disaster. Prioritize the date/time mentioned *within the article's narrative* over the \`pub_date\` and \`pub_time\` if the article's content provides a more precise disaster event time. If no more precise date/time is found, use the \`pub_date\` and \`pub_time\`.
4.  **Construct JSON Object:** Create a JSON object for the article with the following keys:
    * \`disaster_location\`: The extracted specific location of the disaster.
    * \`article_link\`: The original link to the article.
    * \`disaster_datetime\`: The most accurate date and time of the disaster, formatted as "YYYY-MM-DD HH:MM:SS" (or "YYYY-MM-DD" if time is not available).
    * \`disaster_type\`: A short description of the type of disaster (e.g., "flood", "earthquake", etc.)

Only return the filtered array of disaster-related JSON objects. Do not include any other output or explanation. If no article qualifies, return an empty array \`[]\`.

Articles:
\`\`\`json
${JSON.stringify(articlesInput, null, 2)}
\`\`\`
`;

  try {

     const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    const text = result.text;
    res.json({data:text.trim()});
  } catch (err) {
    console.error("❌ Gemini generation failed:", err);
    return res.status(500).json({ error: "Gemini generation failed" });
  }
}

export default main;
