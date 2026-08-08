#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApp } from "./http.js";
import { createTikTokServer } from "./server.js";

type CliOptions = {
  http: boolean;
  port: number;
  apiUrl?: string;
};

function readCliOptions(argv: string[]): CliOptions {
  let http = false;
  let port = Number(process.env.PORT || 3000);
  let apiUrl = process.env.TIKTOK_API_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--http") http = true;
    else if (value === "--port") port = Number(argv[++index]);
    else if (value === "--api-url") apiUrl = argv[++index];
    else if (value === "--help" || value === "-h") {
      process.stdout.write(`TikTok MCP\n\nUsage:\n  tiktok-mcp [--api-url URL]\n  tiktok-mcp --http [--port 3000] [--api-url URL]\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  return { http, port, apiUrl };
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));

  if (options.http) {
    const app = createHttpApp(options.apiUrl);
    const listener = app.listen(options.port, () => {
      console.error(`[tiktok-mcp] listening on http://127.0.0.1:${options.port}/mcp`);
    });
    const close = () => listener.close(() => process.exit(0));
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return;
  }

  const server = createTikTokServer({ apiUrl: options.apiUrl, allowLocalFiles: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[tiktok-mcp] running over stdio");
}

main().catch((error) => {
  console.error("[tiktok-mcp]", error instanceof Error ? error.message : error);
  process.exit(1);
});

export { createTikTokServer } from "./server.js";
export { createHttpApp } from "./http.js";
export { TikTokApiClient, buildToolResult } from "./api-client.js";
