import assert from "node:assert/strict";
import test from "node:test";
import { parseExtraction } from "../services/aiProcessing.service.js";
import { buildIncidentCacheKey } from "../controllers/incident.controller.js";

test("AI extraction parser accepts a valid fenced JSON response", () => {
  const parsed = parseExtraction(`\`\`\`json
{
  "isDisaster": true,
  "disasterType": "flood",
  "locationName": "Bihar, India",
  "locationPrecision": "region",
  "occurredAt": "2026-08-22T06:36:37.000Z",
  "severity": "moderate",
  "summary": "Flooding affects roads.",
  "confidence": 0.9
}
\`\`\``);

  assert.equal(parsed.result.isDisaster, true);
  assert.equal(parsed.result.locationPrecision, "region");
  assert.equal(parsed.confidence, 0.9);
});

test("AI extraction parser rejects invalid confidence and precision", () => {
  assert.throws(
    () => parseExtraction('{"isDisaster":true,"confidence":2}'),
    /invalid confidence/
  );

  assert.throws(
    () => parseExtraction('{"isDisaster":true,"confidence":0.7,"locationPrecision":"planet"}'),
    /invalid locationPrecision/
  );
});

test("incident cache keys are deterministic for the same filter", () => {
  assert.equal(
    buildIncidentCacheKey({
      version: "4",
      statuses: ["active", "candidate"],
      limit: 17
    }),
    "incidents:v4:status=active,candidate:limit=17"
  );
});
