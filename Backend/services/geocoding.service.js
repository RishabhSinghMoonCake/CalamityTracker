import axios from "axios";
import GeocodeCache from "../models/geocodeCache.model.js";

const GEOCODING_BASE_URL =
  process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";

const USER_AGENT =
  process.env.GEOCODING_USER_AGENT || "CalamityTracker/1.0";

const MINIMUM_REQUEST_GAP_MS = 1100;

let lastProviderRequestAt = 0;

function normalizeLocationQuery(locationName) {
  return locationName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isUsableLocationName(locationName) {
  const unusableValues = [
    "",
    "unknown",
    "not specified",
    "n/a",
    "null"
  ];

  return !unusableValues.includes(
    normalizeLocationQuery(locationName)
  );
}

async function respectProviderRateLimit() {
  const elapsed = Date.now() - lastProviderRequestAt;
  const waitTime = MINIMUM_REQUEST_GAP_MS - elapsed;

  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastProviderRequestAt = Date.now();
}

export async function geocodeLocation(locationName) {
  if (!locationName || !isUsableLocationName(locationName)) {
    return null;
  }

  const normalizedQuery = normalizeLocationQuery(locationName);

  const cachedResult = await GeocodeCache.findOne({
    normalizedQuery
  });

  if (cachedResult?.status === "resolved") {
    return {
      displayName: cachedResult.displayName,
      location: cachedResult.location,
      provider: cachedResult.provider,
      cached: true
    };
  }

  if (cachedResult?.status === "not_found") {
    return null;
  }

  try {
    await respectProviderRateLimit();

    const response = await axios.get(
      `${GEOCODING_BASE_URL}/search`,
      {
        params: {
          q: locationName,
          format: "jsonv2",
          limit: 1,
          addressdetails: 1
        },
        headers: {
          "User-Agent": USER_AGENT
        },
        timeout: 10000
      }
    );

    const match = response.data?.[0];

    if (!match) {
      await GeocodeCache.findOneAndUpdate(
        { normalizedQuery },
        {
          normalizedQuery,
          originalQuery: locationName,
          status: "not_found",
          displayName: null,
          location: null,
          provider: "nominatim",
          lastError: null
        },
        {
          upsert: true,
          new: true
        }
      );

      return null;
    }

    const latitude = Number(match.lat);
    const longitude = Number(match.lon);

    const coordinatesAreValid =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    if (!coordinatesAreValid) {
      throw new Error("Geocoding provider returned invalid coordinates");
    }

    const savedResult = await GeocodeCache.findOneAndUpdate(
      { normalizedQuery },
      {
        normalizedQuery,
        originalQuery: locationName,
        status: "resolved",
        displayName: match.display_name,
        location: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        provider: "nominatim",
        providerConfidence: Math.min(
          Math.max(Number(match.importance) || 0, 0),
          1
        ),
        lastError: null
      },
      {
        upsert: true,
        new: true
      }
    );

    return {
      displayName: savedResult.displayName,
      location: savedResult.location,
      provider: savedResult.provider,
      cached: false
    };
  } catch (error) {
    await GeocodeCache.findOneAndUpdate(
      { normalizedQuery },
      {
        normalizedQuery,
        originalQuery: locationName,
        status: "failed",
        lastError: error.message
      },
      {
        upsert: true,
        new: true
      }
    );

    throw error;
  }
}