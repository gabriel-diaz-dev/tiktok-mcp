import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createHttpApp } from "../http.js";

async function mcpPost(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("hosted transport initializes and exposes only TikTok tools", async () => {
  const listener = createHttpApp("https://example.test").listen(0);
  await once(listener, "listening");
  const { port } = listener.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/mcp`;

  try {
    const initialized = await mcpPost(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    assert.equal(initialized.result.serverInfo.name, "ai.palmyr/tiktok");

    const listed = await mcpPost(url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const names = listed.result.tools.map((tool: { name: string }) => tool.name);
    assert.equal(names.length, 16);
    assert.deepEqual(names.slice(0, 4), [
      "tiktok_connect",
      "tiktok_connect_status",
      "tiktok_accounts",
      "tiktok_post",
    ]);
    assert.ok(names.every((name: string) => name.startsWith("tiktok_")));
  } finally {
    await new Promise<void>((resolve, reject) => {
      listener.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
