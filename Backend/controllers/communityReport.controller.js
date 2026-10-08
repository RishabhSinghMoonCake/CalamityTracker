import { consumeRateLimit } from "../services/rateLimit.service.js";
import {
  createCommunityReport,
  validateCommunityReport,
  corroborateCommunityReport,
  getPublicCommunityReports,
  getMyCommunityReports,
  verifyReportByAdmin
} from "../services/communityReport.service.js";

export async function submitCommunityReport(req, res) {
  const validationError = validateCommunityReport(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const rate = await consumeRateLimit({
      key: `rate:community-report:${req.ip}`,
      limit: Number(process.env.COMMUNITY_REPORT_RATE_LIMIT || 5),
      windowSeconds: Number(process.env.COMMUNITY_REPORT_RATE_WINDOW_SECONDS || 3600)
    });

    if (!rate.allowed) {
      return res.status(429).set("Retry-After", String(rate.retryAfterSeconds)).json({
        message: "Too many reports from this network. Please try again later.",
        retryAfterSeconds: rate.retryAfterSeconds
      });
    }

    const reporterKey = req.get("X-Reporter-Key") || req.ip;
    const result = await createCommunityReport(req.body, reporterKey);

    return res.status(result.idempotent ? 200 : 201).json({
      reportId: result.report._id,
      status: result.report.status,
      idempotent: result.idempotent,
      incidentId: result.incident?._id || null,
      confirmationsNeeded: result.confirmationsNeeded ?? null,
      attached: result.attached ?? false
    });
  } catch (error) {
    console.error("Community report submission failed:", error.message);
    return res.status(503).json({ message: "Unable to accept report right now", error: error.message });
  }
}

export async function getPublicReports(req, res) {
  try {
    const { type, limit } = req.query;
    const reports = await getPublicCommunityReports({ type, limit });
    return res.status(200).json({
      data: reports,
      meta: { count: reports.length }
    });
  } catch (error) {
    console.error("Failed to fetch public community reports:", error.message);
    return res.status(500).json({ message: "Failed to fetch community reports" });
  }
}

export async function getMyReports(req, res) {
  try {
    const reporterKey = req.get("X-Reporter-Key") || req.ip;
    const reports = await getMyCommunityReports(reporterKey);
    return res.status(200).json({
      data: reports,
      meta: { count: reports.length }
    });
  } catch (error) {
    console.error("Failed to fetch user community reports:", error.message);
    return res.status(500).json({ message: "Failed to fetch user reports" });
  }
}

export async function corroborateReport(req, res) {
  try {
    const { id } = req.params;
    const { location, comment } = req.body || {};
    const reporterKey = req.get("X-Reporter-Key") || req.ip;

    const rate = await consumeRateLimit({
      key: `rate:community-corroborate:${req.ip}`,
      limit: 10,
      windowSeconds: 3600
    });

    if (!rate.allowed) {
      return res.status(429).json({
        message: "Too many corroboration actions. Please wait.",
        retryAfterSeconds: rate.retryAfterSeconds
      });
    }

    const result = await corroborateCommunityReport({
      reportId: id,
      reporterKey,
      location,
      comment
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to corroborate community report:", error.message);
    return res.status(400).json({ message: error.message });
  }
}

export async function verifyReport(req, res) {
  try {
    const { id } = req.params;
    const result = await verifyReportByAdmin(id);
    return res.status(200).json({
      message: "Report successfully verified and promoted to active incident",
      ...result
    });
  } catch (error) {
    console.error("Failed to verify report:", error.message);
    return res.status(400).json({ message: error.message });
  }
}
