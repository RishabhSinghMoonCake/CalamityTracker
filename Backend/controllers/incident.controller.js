import { createIncidentFromExtraction } from
  "../services/incidentCreation.service.js";

import Incident from "../models/incident.model.js";
import redisClient from "../config/redis.js";
import { invalidateIncidentsCache } from "../services/incidentCache.service.js";

export function buildIncidentCacheKey({ version, statuses, limit }) {
  return `incidents:v${version}:status=${statuses.join(",")}:limit=${limit}`;
}

export async function createIncident(req, res) {
  try {
    const { extractionId } = req.body;

    if (!extractionId) {
      return res.status(400).json({
        message: "extractionId is required"
      });
    }

    const result = await createIncidentFromExtraction(extractionId);

    if (result.created || result.merged) {
      await invalidateIncidentsCache();
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Incident creation failed:", error.message);

    return res.status(500).json({
      message: "Incident creation failed",
      error: error.message
    });
  }
}

export async function getIncidents(req, res) {
  const startedAt = Date.now();

  try {
    const allowedStatuses = [
      "candidate",
      "active",
      "resolved",
      "rejected"
    ];

    const requestedStatuses = req.query.status
      ? req.query.status.split(",")
      : ["candidate", "active"];

    const statuses = [
      ...new Set(
        requestedStatuses.filter((status) =>
          allowedStatuses.includes(status)
        )
      )
    ].sort();

    const finalStatuses = statuses.length
      ? statuses
      : ["active", "candidate"];

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      200
    );

    let cacheKey;

    try {
      const cacheVersion =
        (await redisClient.get("incidents:cache-version")) || "0";

      cacheKey = buildIncidentCacheKey({
        version: cacheVersion,
        statuses: finalStatuses,
        limit
      });

      const cachedResponse = await redisClient.get(cacheKey);

      if (cachedResponse) {
        return res
          .set("X-Cache", "HIT")
          .set(
            "X-Response-Time",
            `${Date.now() - startedAt}ms`
          )
          .status(200)
          .json(JSON.parse(cachedResponse));
      }
    } catch (cacheError) {
      console.warn(
        "Incident cache read failed; using MongoDB:",
        cacheError.message
      );
    }

    const incidents = await Incident.find({
      status: {
        $in: finalStatuses
      }
    })
      .sort({ lastUpdatedAt: -1 })
      .limit(limit)
      .populate(
        "evidenceArticles",
        "title canonicalUrl source publishedAt"
      )
      .lean();

    const responseData = incidents.map((incident) => ({
      id: incident._id,
      type: incident.type,
      status: incident.status,
      severity: incident.severity,
      locationName: incident.locationName,
      locationPrecision: incident.locationPrecision,
      location: incident.location,
      occurredAt: incident.occurredAt,
      summary: incident.summary,
      confidenceScore: incident.confidenceScore,
      evidenceCount: incident.evidenceArticles.length,
      sources: incident.evidenceArticles
    }));

    const responsePayload = {
      data: responseData,
      meta: {
        count: responseData.length,
        statuses: finalStatuses
      }
    };

    try {
      const ttlSeconds = Number(
        process.env.INCIDENTS_CACHE_TTL_SECONDS || 60
      );

      await redisClient.set(
        cacheKey,
        JSON.stringify(responsePayload),
        {
          EX: ttlSeconds
        }
      );
    } catch (cacheError) {
      console.warn(
        "Incident cache write failed:",
        cacheError.message
      );
    }

    return res
      .set("X-Cache", "MISS")
      .set(
        "X-Response-Time",
        `${Date.now() - startedAt}ms`
      )
      .status(200)
      .json(responsePayload);
  } catch (error) {
    console.error("Failed to fetch incidents:", error.message);

    return res.status(500).json({
      message: "Failed to fetch incidents"
    });
  }
}
