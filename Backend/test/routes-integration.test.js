import assert from "node:assert/strict";
import test from "node:test";
import app from "../app.js";

async function withServer(run) {
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("GET /api/admin/queues returns queue health status", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/queues`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.timestamp);
    assert.ok(body.queues);
  });
});

test("admin endpoints reject a missing or incorrect admin key when configured", async () => {
  const previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = "test-admin-secret";
  try {
    await withServer(async (baseUrl) => {
      const rejected = await fetch(`${baseUrl}/api/admin/queues`);
      assert.equal(rejected.status, 401);
      const accepted = await fetch(`${baseUrl}/api/admin/queues`, { headers: { "X-Admin-Key": "test-admin-secret" } });
      assert.equal(accepted.status, 200);
    });
  } finally {
    if (previousKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previousKey;
  }
});

test("GET /api/admin/ai/providers returns AI routing chain and providers status", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/ai/providers`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.routingChain));
    assert.ok(body.providers);
  });
});

test("POST /api/reports rejects malformed community reports with 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Too short" })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.message);
  });
});
