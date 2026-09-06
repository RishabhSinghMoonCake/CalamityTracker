import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "redis";

test("Redis accepts a ping and supports incident cache-version invalidation", async () => {
  const client = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: false
    }
  });

  const key = `test:incidents:cache-version:${process.pid}`;

  try {
    await client.connect();
    assert.equal(await client.ping(), "PONG");
    assert.equal(await client.incr(key), 1);
    assert.equal(await client.incr(key), 2);
  } finally {
    if (client.isOpen) {
      await client.del(key);
      await client.quit();
    }
  }
});
