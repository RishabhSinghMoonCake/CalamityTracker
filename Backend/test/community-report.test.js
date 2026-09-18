import assert from "node:assert/strict";
import test from "node:test";
import { validateCommunityReport } from "../services/communityReport.service.js";

const validReport = {
  clientReportId: "test-report-1",
  type: "flood",
  description: "Flood water has blocked the main road near the village.",
  severity: "high",
  location: { coordinates: [85.1376, 25.0961] },
  occurredAt: "2026-09-18T10:00:00.000Z"
};

test("community report validator accepts a safe, map-ready report", () => {
  assert.equal(validateCommunityReport(validReport), null);
});

test("community report validator rejects malformed coordinates and short text", () => {
  assert.match(validateCommunityReport({ ...validReport, description: "short" }), /10-1000/);
  assert.match(
    validateCommunityReport({ ...validReport, location: { coordinates: [200, 25] } }),
    /out of range/
  );
});
