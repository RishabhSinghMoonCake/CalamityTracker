import cron from "node-cron";
import Disaster from "../models/data.model.js";
import { getProcessedDisasters } from "../services/disaster.service.js";

async function cacheDisasters() {
  try {
    console.log("Fetching latest disasters...");

    const disasters = await getProcessedDisasters();

    if (!disasters.length) {
      console.log("No disasters found.");
      return;
    }

    const validDisasters = disasters
      .filter(
        (d) =>
          d.disaster_location &&
          d.article_link &&
          d.disaster_type &&
          d.disaster_datetime &&
          typeof d.lat === "number" &&
          typeof d.lng === "number"
      )
      .map((d) => ({
        disaster_location: d.disaster_location,
        article_link: d.article_link,
        disaster_datetime: new Date(d.disaster_datetime),
        disaster_type: d.disaster_type,
        lat: d.lat,
        lng: d.lng
      }))
      .filter((d) => !isNaN(d.disaster_datetime));

    if (!validDisasters.length) {
      console.log("No valid disasters after filtering.");
      return;
    }

    await Disaster.deleteMany({});
    await Disaster.insertMany(validDisasters);

    console.log(`Replaced cache with ${validDisasters.length} disasters`);

  } catch (error) {
    console.error("Cache worker error:", error.message);
  }
}

async function initCache() {
  const count = await Disaster.countDocuments();

  if (count === 0) {
    console.log("DB empty. Fetching initial disasters...");
    await cacheDisasters();
  } else {
    console.log(`DB already has ${count} disasters. Skipping initial fetch.`);
  }
}

cron.schedule("0 */6 * * *", cacheDisasters);

initCache();