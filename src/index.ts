#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTikTokServer } from "./server.js";

function configure(argv: string[]): void {
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--data-dir") process.env.TIKTOK_MCP_DATA_DIR = argv[++index];
    else if (value === "--browser-path") process.env.TIKTOK_BROWSER_PATH = argv[++index];
    else if (value === "--headless") process.env.TIKTOK_HEADLESS = "true";
    else if (value === "--help" || value === "-h") {
      process.stdout.write(
        "TikTok MCP (self-hosted)\n\n" +
        "Usage: tiktok-mcp [--data-dir PATH] [--browser-path PATH] [--headless]\n\n" +
        "The MCP runs TikTok browser automation entirely on this device over stdio.\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown option: ${value}`);
  }
}

async function main(): Promise<void> {
  configure(process.argv.slice(2));
  const server = createTikTokServer();
  await server.connect(new StdioServerTransport());
  console.error("[tiktok-mcp] local runtime ready over stdio");
}

main().catch((error) => {
  console.error("[tiktok-mcp]", error instanceof Error ? error.message : error);
  process.exit(1);
});

export { createTikTokServer } from "./server.js";
export { LocalTikTokRuntime } from "./runtime/local-runtime.js";
