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

test("MultiAiRouter permits mock only when it is explicitly configured", async () => {
  const router = new MultiAiRouter();
  const article = {
    title: "Earthquake of magnitude 6.2 reported",
    description: "Tremors felt across the capital city.",
    country: "Japan",
    publishedAt: new Date()
  };

  const previousPrimary = process.env.AI_PRIMARY_PROVIDER;
  const previousFallbacks = process.env.AI_FALLBACK_PROVIDERS;
  process.env.AI_PRIMARY_PROVIDER = "mock";
  process.env.AI_FALLBACK_PROVIDERS = "";
  try {
    const result = await router.classify(article);
    assert.equal(result.provider, "mock");
    assert.ok(result.result.isDisaster);
  } finally {
    if (previousPrimary === undefined) delete process.env.AI_PRIMARY_PROVIDER;
    else process.env.AI_PRIMARY_PROVIDER = previousPrimary;
    if (previousFallbacks === undefined) delete process.env.AI_FALLBACK_PROVIDERS;
    else process.env.AI_FALLBACK_PROVIDERS = previousFallbacks;
  }
});
