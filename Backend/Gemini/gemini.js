import { GoogleGenAI } from "@google/genai"; // Corrected import for generative-ai
import axios from "axios";
// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // Renamed 'ai' to 'genAI' for clarity


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
          return response.data; // ✅ this is where 'status' and 'results' live
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
        const {
          link,
          pubDate,
          country,
          content,
          title
        } = item;

        output.push({
          link,
          pub_date: pubDate.split(" ")[0],
          pub_time: pubDate.split(" ")[1],
          location_country: country?.[0] || "unknown",
          content: title || ""
        });
      }
    }

    return output;

  } catch (error) {
    console.error("❌ Error fetching news:", error.message);
    return [];
  }
}



async function main() {
  const articlesInput = await fetchNews().catch(console.error);
  if(articlesInput.length === 0) {
    console.log("No articles found.");
    return;
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

**Input Format:**

You will receive an array of JSON objects, where each object represents a news article with the following structure:

\`\`\`json
[
  {
    "link": "https://example.com/news/article1",
    "pub_date": "2025-07-19",
    "pub_time": "10:30:00",
    "location_country": "USA"
  },
  {
    "link": "https://example.com/news/article2",
    "pub_date": "2025-07-20",
    "pub_time": "14:15:00",
    "location_country": "Japan"
  }
]
\`\`\`

**Output Format:**

Your output must be a single JSON array containing only the filtered articles, each formatted as described above. Do not include any additional text or explanations outside of the JSON array. If no articles correspond to a disaster, return an empty JSON array \`[]\`.

**Example Output (Illustrative - you will populate this based on article content):**

\`\`\`json
[
  {
    "disaster_location": "Lahaina, Maui, Hawaii",
    "article_link": "https://example.com/news/article1",
    "disaster_datetime": "2025-07-18 23:00:00",
    "disaster_type": "wildfire"
  },
  {
    "disaster_location": "Kyoto, Japan",
    "article_link": "https://example.com/news/article2",
    "disaster_datetime": "2025-07-20",
    "disaster_type": "earthquake"
  }
]
\`\`\`

**Instructions for the AI:**

Process the following array of news articles, making sure to fetch content from the provided links for analysis and only return articles that correspond to a calamity or disaster. Ensure that the \`disaster_location\` is as specific as possible, and the \`disaster_datetime\` is formatted correctly. If an article does not describe a calamity or disaster, do not include it in the output.:

${JSON.stringify(articlesInput)}
`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
  const text = result.text;
  console.log(text);
}

export default main;