import { createIncidentFromExtraction } from
  "../services/incidentCreation.service.js";

import Incident from "../models/incident.model.js";

export async function createIncident(req, res) {
  try {
    const { extractionId } = req.body;

    if (!extractionId) {
      return res.status(400).json({
        message: "extractionId is required"
      });
    }

    const result = await createIncidentFromExtraction(extractionId);

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

    const statuses = requestedStatuses.filter((status) =>
      allowedStatuses.includes(status)
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      200
    );

    const incidents = await Incident.find({
      status: {
        $in: statuses.length
          ? statuses
          : ["candidate", "active"]
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

    return res.status(200).json({
      data: responseData,
      meta: {
        count: responseData.length,
        statuses
      }
    });
  } catch (error) {
    console.error("Failed to fetch incidents:", error.message);

    return res.status(500).json({
      message: "Failed to fetch incidents"
    });
  }
}