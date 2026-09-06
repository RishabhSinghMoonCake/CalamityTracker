import AiExtraction from "../models/aiExtraction.model.js";
import Incident from "../models/incident.model.js";
import { geocodeLocation } from "./geocoding.service.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createIncidentFromExtraction(extractionId) {
  const extraction = await AiExtraction.findById(extractionId).populate(
    "rawArticleId"
  );

  if (!extraction) {
    throw new Error("AI extraction not found");
  }

  if (
    extraction.status !== "success" ||
    !extraction.result.isDisaster
  ) {
    return {
      created: false,
      reason: "Extraction is not a confirmed disaster candidate"
    };
  }

  const existingIncidentForExtraction = await Incident.findOne({
    evidenceExtractions: extraction._id
  });

  if (existingIncidentForExtraction) {
    return {
      created: false,
      reason: "This extraction is already attached to an incident",
      incidentId: existingIncidentForExtraction._id
    };
  }

  const { disasterType, locationName,locationPrecision, occurredAt, severity, summary } =
    extraction.result;

  if (!disasterType || !locationName) {
    return {
      created: false,
      reason: "Extraction lacks a disaster type or usable location"
    };
  }

  const geocodedLocation = await geocodeLocation(locationName);

  if (!geocodedLocation) {
    return {
      created: false,
      reason: "Location could not be geocoded"
    };
  }

  const eventTime = occurredAt || extraction.rawArticleId.publishedAt;

  // Initial duplicate rule:
  // same incident type + same named location + within 24 hours.
  const timeWindowMs = 24 * 60 * 60 * 1000;

  const matchingIncident = await Incident.findOne({
    type: disasterType.toLowerCase(),
    locationName: new RegExp(
      `^${escapeRegex(locationName)}$`,
      "i"
    ),
    status: {
      $in: ["candidate", "active"]
    },
    occurredAt: {
      $gte: new Date(eventTime.getTime() - timeWindowMs),
      $lte: new Date(eventTime.getTime() + timeWindowMs)
    }
  });

  if (matchingIncident) {
    await Incident.findByIdAndUpdate(matchingIncident._id, {
      $addToSet: {
        evidenceArticles: extraction.rawArticleId._id,
        evidenceExtractions: extraction._id
      },
      $max: {
        confidenceScore: extraction.confidence
      },
      $set: {
        lastUpdatedAt: new Date()
      }
    });

    return {
      created: false,
      merged: true,
      incidentId: matchingIncident._id
    };
  }

  const incident = await Incident.create({
    type: disasterType.toLowerCase(),
    status: "candidate",
    severity: severity || "unknown",
    locationName,
    locationPrecision: locationPrecision || "unknown",
    location: geocodedLocation.location,
    occurredAt: eventTime,
    summary: summary || extraction.rawArticleId.title,
    confidenceScore: extraction.confidence,
    evidenceArticles: [extraction.rawArticleId._id],
    evidenceExtractions: [extraction._id],
    firstReportedAt: new Date(),
    lastUpdatedAt: new Date()
  });

  return {
    created: true,
    merged: false,
    incidentId: incident._id,
    location: incident.location,
    locationName: incident.locationName
  };
}