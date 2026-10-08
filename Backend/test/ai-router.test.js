import assert from "node:assert/strict";
import test from "node:test";
import { parseExtraction, MockProvider, MultiAiRouter } from "../services/aiRouter.service.js";

test("AI Router parseExtraction properly parses valid JSON disaster response", () => {
  const payload = JSON.stringify({
    isDisaster: true,
    disasterType: "wildfire",
    locationName: "California, USA",
    locationPrecision: "region",
    occurredAt: "2026-09-18T12:00:00.000Z",
    severity: "high",
    summary: "Wildfire spreads rapidly across forested area.",
    confidence: 0.95
  });

  const parsed = parseExtraction(payload);
  assert.equal(parsed.result.isDisaster, true);
  assert.equal(parsed.result.disasterType, "wildfire");
  assert.equal(parsed.result.locationName, "California, USA");
  assert.equal(parsed.confidence, 0.95);
});

test("MockProvider correctly classifies disaster keywords", async () => {
  const provider = new MockProvider();
  const article = {
    title: "Major flash flood hits coastal village",
    description: "Heavy rains caused widespread flooding.",
    country: "India",
    publishedAt: new Date()
  };

  const result = await provider.classify(article);
  assert.equal(result.result.isDisaster, true);
  assert.equal(result.result.disasterType, "flood");
  assert.equal(result.provider, "mock");
});

test("MultiAiRouter routes through fallback when primary fails or is mocked", async () => {
  const router = new MultiAiRouter();
  const article = {
    title: "Earthquake of magnitude 6.2 reported",
    description: "Tremors felt across the capital city.",
    country: "Japan",
    publishedAt: new Date()
  };

  // With mock in fallback, it should succeed
  const result = await router.classify(article);
  assert.ok(result.result.isDisaster);
  assert.ok(result.provider);
  assert.ok(result.executionTimeMs >= 0);
});
