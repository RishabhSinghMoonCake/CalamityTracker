import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

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
      "major accident",
      "transport accident",
      "active shooter",
      "terrorist attack",
      "mass casualty",
      "war",
      "missile",
      "attack"
    ];

    const allResponses = [];

    for (const query of keywords) {
      const url = `${process.env.NEWS_API_URL}?apikey=${process.env.NEWS_API_KEY}&q=${encodeURIComponent(query)}`;

      try {
        const response = await axios.get(url);
        allResponses.push(response.data);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } catch (error) {
        console.warn(`Failed for "${query}": ${error.message}`);
      }
    }

    const output = [];

    for (const data of allResponses) {
      if (!data || data.status !== "success" || !Array.isArray(data.results)) {
        continue;
      }

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

    const uniqueOutput = Array.from(
      new Map(output.map((item) => [item.link, item])).values()
    );

    const strongSignals = [
      "dead",
      "killed",
      "injured",
      "evacuated",
      "flood",
      "earthquake",
      "wildfire",
      "landslide",
      "eruption",
      "outbreak",
      "explosion",
      "collapsed",
      "storm",
      "cyclone",
      "attack",
      "missile",
      "war"
    ];

    const filteredOutput = uniqueOutput.filter((article) =>
      strongSignals.some((signal) =>
        article.content.toLowerCase().includes(signal)
      )
    );

    filteredOutput.sort(
      (a, b) =>
        new Date(`${b.pub_date} ${b.pub_time}`) -
        new Date(`${a.pub_date} ${a.pub_time}`)
    );

    console.log(`Fetched ${uniqueOutput.length} unique news articles`);
    console.log(`Filtered to ${filteredOutput.length} strong disaster candidates`);

    return filteredOutput.slice(0, 60);
  } catch (error) {
    console.error("Error fetching news:", error.message);
    return [];
  }
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