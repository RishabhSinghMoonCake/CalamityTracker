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
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

test("GET /api/health reports that the process is alive", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptime, "number");
  });
});

test("GET /api/ready returns dependency state", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ready`);
    const body = await response.json();

    assert.ok([200, 503].includes(response.status));
    assert.ok(["ready", "not_ready"].includes(body.status));
    assert.ok(["up", "down"].includes(body.dependencies.mongodb));
    assert.ok(["up", "down"].includes(body.dependencies.redis));
  });
});
