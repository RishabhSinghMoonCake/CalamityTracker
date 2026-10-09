import { createHash } from "node:crypto";
import CommunityReport from "../models/communityReport.model.js";
import Incident from "../models/incident.model.js";
import { invalidateIncidentsCache } from "./incidentCache.service.js";
import { publishIncidentEvent } from "./realtime.service.js";

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };

export function hashReporter(value) {
  return createHash("sha256").update(String(value || "anonymous")).digest("hex");
}

export function centroid(reports) {
  const [longitude, latitude] = reports.reduce(
    ([lng, lat], report) => [lng + report.location.coordinates[0], lat + report.location.coordinates[1]],
    [0, 0]
  );
  return [longitude / reports.length, latitude / reports.length];
}

export function highestSeverity(reports) {
  return reports.reduce(
    (current, report) =>
      severityRank[report.severity] > severityRank[current] ? report.severity : current,
    "low"
  );
}

/**
 * Jitters or rounds coordinates to ~1km precision to safeguard reporter privacy.
 */
export function anonymizeCoordinates([lng, lat]) {
  return [
    Math.round(lng * 100) / 100,
    Math.round(lat * 100) / 100
  ];
}

export function validateCommunityReport(input) {
  const allowedTypes = [
    "flood", "wildfire", "earthquake", "landslide", "storm",
    "cyclone", "tsunami", "volcano", "outbreak", "accident", "conflict", "other"
  ];
  const value = input || {};
  const coordinates = value.location?.coordinates;

  if (!/^[a-zA-Z0-9-]{16,128}$/.test(String(value.clientReportId || ""))) {
    return "clientReportId must be a 16-128 character UUID-like identifier";
  }
  if (!allowedTypes.includes(value.type)) {
    return `Unsupported incident type: ${value.type}`;
  }
  if (typeof value.description !== "string" || value.description.trim().length < 10 || value.description.length > 1000) {
    return "Description must contain 10-1000 characters";
  }
  if (!severityRank[value.severity]) {
    return "Unsupported severity (must be low, moderate, high, or critical)";
  }
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) {
    return "Location coordinates are required as [longitude, latitude]";
  }
  if (coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) {
    return "Location coordinates are out of valid geographic range";
  }
  if (Number.isNaN(new Date(value.occurredAt).getTime())) {
    return "occurredAt must be a valid date/time";
  }
  if (new Date(value.occurredAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return "occurredAt cannot be in the future";
  }
  return null;
}

/**
 * Creates and clusters a community report.
 */
export async function createCommunityReport(input, reporterKey) {
  const existing = await CommunityReport.findOne({ clientReportId: input.clientReportId });
  if (existing) {
    return { idempotent: true, report: existing, incident: null };
  }

  const reporterHash = hashReporter(reporterKey);

  const report = await CommunityReport.create({
    clientReportId: input.clientReportId,
    reporterHash,
    type: input.type.toLowerCase(),
    description: input.description.trim(),
    severity: input.severity,
    location: { type: "Point", coordinates: input.location.coordinates },
    locationAccuracyMeters: input.locationAccuracyMeters ?? null,
    occurredAt: new Date(input.occurredAt),
    status: "pending",
    corroborationCount: 1,
    corroborations: [
      {
        reporterHash,
        corroboratedAt: new Date(),
        comment: "Initial report submission",
        location: { type: "Point", coordinates: input.location.coordinates }
      }
    ]
  });

  const radiusMeters = Number(process.env.COMMUNITY_CLUSTER_RADIUS_METERS || 5000);
  const threshold = Number(process.env.COMMUNITY_CONFIRMATION_THRESHOLD || 3);
  const since = new Date(Date.now() - Number(process.env.COMMUNITY_CLUSTER_WINDOW_HOURS || 24) * 60 * 60 * 1000);

  // Check if an existing active/candidate incident is nearby
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
    publishIncidentEvent("incident.updated", {
      incidentId: nearbyIncident._id.toString(),
      type: report.type
    });

    return { idempotent: false, report, incident: nearbyIncident, attached: true };
  }

  // Find nearby pending/corroborating reports for clustering
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

    publishIncidentEvent("report.corroborating", {
      reportId: report._id.toString(),
      type: report.type,
      confirmationsNeeded: threshold - distinctReports.length
    });

    return {
      idempotent: false,
      report,
      incident: null,
      attached: false,
      confirmationsNeeded: threshold - distinctReports.length
    };
  }

  // Corroboration threshold met! Promote to candidate incident
  const calculatedCentroid = centroid(distinctReports);
  const incident = await Incident.create({
    type: report.type,
    status: "candidate",
    severity: highestSeverity(distinctReports),
    locationName: `Community Reported ${report.type.toUpperCase()}`,
    locationPrecision: "region",
    location: { type: "Point", coordinates: calculatedCentroid },
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
  publishIncidentEvent("incident.created", {
    incidentId: incident._id.toString(),
    type: incident.type
  });

  return { idempotent: false, report, incident, attached: true };
}

/**
 * Corroborates an existing community report from an independent observer.
 */
export async function corroborateCommunityReport({ reportId, reporterKey, location, comment }) {
  const report = await CommunityReport.findById(reportId);
  if (!report) {
    throw new Error("Report not found");
  }

  if (report.status === "attached_to_incident") {
    return {
      success: true,
      message: "Report is already attached to an active or candidate incident",
      incidentId: report.incidentId
    };
  }

  const reporterHash = hashReporter(reporterKey);
  if (report.reporterHash === reporterHash) {
    throw new Error("You cannot corroborate your own report");
  }

  const alreadyCorroborated = report.corroborations.some(
    (c) => c.reporterHash === reporterHash
  );
  if (alreadyCorroborated) {
    throw new Error("You have already corroborated this report");
  }

  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite) || coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) {
    throw new Error("A valid corroboration location is required");
  }

  report.corroborations.push({
    reporterHash,
    corroboratedAt: new Date(),
    comment: comment?.trim() || null,
    location: { type: "Point", coordinates }
  });
  report.corroborationCount = report.corroborations.length;

  const threshold = Number(process.env.COMMUNITY_CONFIRMATION_THRESHOLD || 3);

  if (report.corroborationCount >= threshold) {
    // Threshold reached via corroboration endorsements! Promote to candidate incident
    const incident = await Incident.create({
      type: report.type,
      status: "candidate",
      severity: report.severity,
      locationName: `Community Confirmed ${report.type.toUpperCase()}`,
      locationPrecision: "city",
      location: report.location,
      occurredAt: report.occurredAt,
      summary: `Community confirmed ${report.type} with ${report.corroborationCount} independent endorsements: ${report.description}`,
      confidenceScore: Math.min(0.6 + report.corroborationCount * 0.08, 0.92),
      evidenceReports: [report._id],
      communityReportCount: report.corroborationCount,
      firstReportedAt: report.createdAt,
      lastUpdatedAt: new Date()
    });

    report.status = "attached_to_incident";
    report.incidentId = incident._id;
    await report.save();

    await invalidateIncidentsCache();
    publishIncidentEvent("incident.created", {
      incidentId: incident._id.toString(),
      type: incident.type
    });

    return {
      success: true,
      promoted: true,
      incidentId: incident._id,
      corroborationCount: report.corroborationCount
    };
  }

  await report.save();
  publishIncidentEvent("report.corroborated", {
    reportId: report._id.toString(),
    corroborationCount: report.corroborationCount,
    confirmationsNeeded: threshold - report.corroborationCount
  });

  return {
    success: true,
    promoted: false,
    corroborationCount: report.corroborationCount,
    confirmationsNeeded: threshold - report.corroborationCount
  };
}

/**
 * Returns public, privacy-preserving community signals for map viewing.
 */
export async function getPublicCommunityReports({ type = null, limit = 50 } = {}) {
  const query = {
    status: { $in: ["corroborating", "attached_to_incident"] }
  };
  if (type) {
    query.type = type.toLowerCase();
  }

  const reports = await CommunityReport.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
    .lean();

  const threshold = Number(process.env.COMMUNITY_CONFIRMATION_THRESHOLD || 3);

  return reports.map((rep) => ({
    id: rep._id,
    type: rep.type,
    severity: rep.severity,
    description: rep.description,
    occurredAt: rep.occurredAt,
    status: rep.status,
    incidentId: rep.incidentId,
    corroborationCount: rep.corroborationCount || 1,
    confirmationsNeeded: Math.max(threshold - (rep.corroborationCount || 1), 0),
    // Anonymized coordinates for privacy:
    location: {
      type: "Point",
      coordinates: anonymizeCoordinates(rep.location.coordinates)
    },
    createdAt: rep.createdAt
  }));
}

/**
 * Returns report history submitted by a specific user (identified by reporterKey).
 */
export async function getMyCommunityReports(reporterKey) {
  const reporterHash = hashReporter(reporterKey);
  const reports = await CommunityReport.find({ reporterHash })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("incidentId", "status locationName summary confidenceScore")
    .lean();

  const threshold = Number(process.env.COMMUNITY_CONFIRMATION_THRESHOLD || 3);

  return reports.map((rep) => ({
    id: rep._id,
    clientReportId: rep.clientReportId,
    type: rep.type,
    severity: rep.severity,
    description: rep.description,
    location: rep.location,
    occurredAt: rep.occurredAt,
    status: rep.status,
    corroborationCount: rep.corroborationCount || 1,
    confirmationsNeeded: Math.max(threshold - (rep.corroborationCount || 1), 0),
    incident: rep.incidentId || null,
    createdAt: rep.createdAt
  }));
}

/**
 * Moderator action to directly verify and promote a report.
 */
export async function verifyReportByAdmin(reportId) {
  const report = await CommunityReport.findById(reportId);
  if (!report) throw new Error("Report not found");

  if (report.incidentId) {
    return { verified: true, incidentId: report.incidentId };
  }

  const incident = await Incident.create({
    type: report.type,
    status: "active",
    severity: report.severity,
    locationName: `Verified Community ${report.type.toUpperCase()}`,
    locationPrecision: "city",
    location: report.location,
    occurredAt: report.occurredAt,
    summary: `Verified incident: ${report.description}`,
    confidenceScore: 0.95,
    evidenceReports: [report._id],
    communityReportCount: report.corroborationCount,
    firstReportedAt: report.createdAt,
    lastUpdatedAt: new Date()
  });

  report.status = "attached_to_incident";
  report.incidentId = incident._id;
  report.verifiedByAdmin = true;
  await report.save();

  await invalidateIncidentsCache();
  publishIncidentEvent("incident.created", { incidentId: incident._id.toString() });

  return { verified: true, incidentId: incident._id };
}
