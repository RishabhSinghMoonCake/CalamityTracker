import { consumeRateLimit } from "../services/rateLimit.service.js";
import { createCommunityReport, validateCommunityReport } from "../services/communityReport.service.js";

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
      confirmationsNeeded: result.confirmationsNeeded ?? null
    });
  } catch (error) {
    console.error("Community report submission failed:", error.message);
    return res.status(503).json({ message: "Unable to accept report right now" });
  }
}
