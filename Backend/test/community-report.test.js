import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCommunityReport,
  anonymizeCoordinates,
  hashReporter,
  highestSeverity
} from "../services/communityReport.service.js";

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
    /out of valid geographic range/
  );
});

test("anonymizeCoordinates rounds coordinates to protect citizen privacy", () => {
  const exact = [85.137682, 25.096144];
  const anonymized = anonymizeCoordinates(exact);
  assert.deepEqual(anonymized, [85.14, 25.1]);
});

test("hashReporter deterministically hashes reporter keys", () => {
  const hash1 = hashReporter("user-12345");
  const hash2 = hashReporter("user-12345");
  const hash3 = hashReporter("user-67890");
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test("highestSeverity correctly determines maximum reported severity", () => {
  const reports = [
    { severity: "low" },
    { severity: "high" },
    { severity: "moderate" }
  ];
  assert.equal(highestSeverity(reports), "high");
});
