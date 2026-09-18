import { createHash } from "node:crypto";
import CommunityReport from "../models/communityReport.model.js";
import Incident from "../models/incident.model.js";
import { invalidateIncidentsCache } from "./incidentCache.service.js";
import { publishIncidentEvent } from "./realtime.service.js";

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };

function hashReporter(value) {
  return createHash("sha256").update(value).digest("hex");
}

function centroid(reports) {
  const [longitude, latitude] = reports.reduce(
    ([lng, lat], report) => [lng + report.location.coordinates[0], lat + report.location.coordinates[1]],
    [0, 0]
  );
  return [longitude / reports.length, latitude / reports.length];
}

function highestSeverity(reports) {
  return reports.reduce((current, report) =>
    severityRank[report.severity] > severityRank[current] ? report.severity : current,
  "low");
}

export function validateCommunityReport(input) {
  const allowedTypes = ["flood", "wildfire", "earthquake", "landslide", "storm", "cyclone", "tsunami", "volcano", "outbreak", "accident", "conflict", "other"];
  const value = input || {};
  const coordinates = value.location?.coordinates;

  if (!value.clientReportId || String(value.clientReportId).length > 128) return "clientReportId is required";
  if (!allowedTypes.includes(value.type)) return "Unsupported incident type";
  if (typeof value.description !== "string" || value.description.trim().length < 10 || value.description.length > 1000) return "Description must contain 10-1000 characters";
  if (!severityRank[value.severity]) return "Unsupported severity";
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return "Location coordinates are required";
  if (coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) return "Location coordinates are out of range";
  if (Number.isNaN(new Date(value.occurredAt).getTime())) return "occurredAt must be a valid date";
  return null;
}

export async function createCommunityReport(input, reporterKey) {
  const existing = await CommunityReport.findOne({ clientReportId: input.clientReportId });
  if (existing) return { idempotent: true, report: existing, incident: null };

  const report = await CommunityReport.create({
    clientReportId: input.clientReportId,
    reporterHash: hashReporter(reporterKey),
    type: input.type,
    description: input.description.trim(),
    severity: input.severity,
    location: { type: "Point", coordinates: input.location.coordinates },
    locationAccuracyMeters: input.locationAccuracyMeters ?? null,
    occurredAt: new Date(input.occurredAt)
  });

  const radiusMeters = Number(process.env.COMMUNITY_CLUSTER_RADIUS_METERS || 5000);
  const threshold = Number(process.env.COMMUNITY_CONFIRMATION_THRESHOLD || 3);
  const since = new Date(Date.now() - Number(process.env.COMMUNITY_CLUSTER_WINDOW_HOURS || 24) * 60 * 60 * 1000);

  const nearbyIncident = await Incident.findOne({
    type: report.type,
    status: { $in: ["candidate", "active"] },
    location: {
      $near: {
        $geometry: report.location,
        $maxDistance: radiusMeters
      }
    }
  });

  if (nearbyIncident) {
    await Incident.findByIdAndUpdate(nearbyIncident._id, {
      $addToSet: { evidenceReports: report._id },
      $inc: { communityReportCount: 1 },
      $set: { lastUpdatedAt: new Date() }
    });
    report.status = "attached_to_incident";
    report.incidentId = nearbyIncident._id;
    await report.save();
    await invalidateIncidentsCache();
    publishIncidentEvent("incident.updated", { incidentId: nearbyIncident._id.toString() });
    return { idempotent: false, report, incident: nearbyIncident, attached: true };
  }

  const nearbyReports = await CommunityReport.find({
    type: report.type,
    status: { $in: ["pending", "corroborating"] },
    createdAt: { $gte: since },
    location: { $near: { $geometry: report.location, $maxDistance: radiusMeters } }
  }).limit(25);

  const distinctReports = [...new Map(nearbyReports.map((item) => [item.reporterHash, item])).values()];

  if (distinctReports.length < threshold) {
    report.status = "corroborating";
    await report.save();
    return { idempotent: false, report, incident: null, attached: false, confirmationsNeeded: threshold - distinctReports.length };
  }

  const incident = await Incident.create({
    type: report.type,
    status: "candidate",
    severity: highestSeverity(distinctReports),
    locationName: "Community-reported area",
    locationPrecision: "region",
    location: { type: "Point", coordinates: centroid(distinctReports) },
    occurredAt: new Date(Math.min(...distinctReports.map((item) => item.occurredAt.getTime()))),
    summary: `${distinctReports.length} independent community reports indicate a possible ${report.type}.`,
    confidenceScore: Math.min(0.55 + distinctReports.length * 0.1, 0.9),
    evidenceReports: distinctReports.map((item) => item._id),
    communityReportCount: distinctReports.length,
    firstReportedAt: report.createdAt,
    lastUpdatedAt: new Date()
  });

  await CommunityReport.updateMany(
    { _id: { $in: distinctReports.map((item) => item._id) } },
    { $set: { status: "attached_to_incident", incidentId: incident._id } }
  );
  await invalidateIncidentsCache();
  publishIncidentEvent("incident.created", { incidentId: incident._id.toString() });
  return { idempotent: false, report, incident, attached: true };
}
