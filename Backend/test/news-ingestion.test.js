import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeNewsResponses
} from "../services/disaster.service.js";
import { ingestNews } from "../services/newsIngestion.service.js";

const article = {
  article_id: "provider-1",
  link: "https://example.com/flood",
  title: "  Flood reaches Bihar  ",
  description: "  Rising water affects roads. ",
  pubDate: "2026-08-22 06:36:37",
  country: ["india"]
};

test("news normalization removes duplicate URLs and keeps provider evidence", () => {
  const normalized = normalizeNewsResponses([
    { results: [article] },
    { results: [article] },
    { results: [{ ...article, link: "https://example.com/bad-date", pubDate: "invalid" }] }
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].canonicalUrl, article.link);
  assert.equal(normalized[0].title, "Flood reaches Bihar");
  assert.equal(normalized[0].country, "india");
  assert.equal(normalized[0].rawPayload.article_id, "provider-1");
  assert.equal(normalized[0].publishedAt.toISOString(), "2026-08-22T06:36:37.000Z");
});

test("ingestion creates URL-based upserts and reports inserted versus known counts", async () => {
  let receivedOperations = [];

  const result = await ingestNews({
    fetchArticles: async () => [
      {
        source: "newsdata",
        canonicalUrl: article.link,
        title: "Flood reaches Bihar",
        description: "Rising water affects roads.",
        publishedAt: new Date("2026-08-22T06:36:37.000Z"),
        country: "india",
        rawPayload: article
      }
    ],
    articleRepository: {
      bulkWrite: async (operations) => {
        receivedOperations = operations;
        return {
          upsertedCount: 1,
          matchedCount: 0,
          upsertedIds: { 0: "raw-article-id" }
        };
      }
    }
  });

  assert.equal(result.fetched, 1);
  assert.equal(result.inserted, 1);
  assert.equal(result.alreadyKnown, 0);
  assert.deepEqual(result.insertedArticleIds, ["raw-article-id"]);
  assert.equal(receivedOperations.length, 1);
  assert.equal(
    receivedOperations[0].updateOne.filter.canonicalUrl,
    article.link
  );
  assert.deepEqual(
    receivedOperations[0].updateOne.update.$setOnInsert.rawPayload,
    article
  );
});
