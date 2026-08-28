import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LocalTikTokRuntime } from "./runtime/local-runtime.js";

type Shape = Record<string, z.ZodTypeAny>;
type ToolResult = { isError?: boolean; content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> };

const ACCOUNT_ID = z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/)
  .describe("Local account name using letters, numbers, dots, dashes, or underscores");

function requireOne(args: Record<string, unknown>, fields: string[]): void {
  const supplied = fields.filter((field) => typeof args[field] === "string" && (args[field] as string).length > 0);
  if (supplied.length !== 1) throw new Error(`Pass exactly one of ${fields.join(", ")}`);
}

function result(value: unknown): ToolResult {
  const structured = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value };
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: structured };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: true, message }) }] };
}

function addTool(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: Shape },
  handler: (args: Record<string, any>) => unknown | Promise<unknown>,
): void {
  (server.registerTool as any)(name, config, async (args: Record<string, any>) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  });
}

export type TikTokServerOptions = { runtime?: LocalTikTokRuntime };

export function createTikTokServer(options: TikTokServerOptions = {}): McpServer {
  const runtime = options.runtime || new LocalTikTokRuntime();
  const server = new McpServer(
    { name: "ai.palmyr/tiktok", title: "TikTok MCP", version: "0.3.1" },
    { instructions: "Self-hosted TikTok automation. Browser profiles, actions, media, and analytics stay on this device. Connect uses a free ephemeral QR relay so a remote human can scan a shareable link; there are no API keys or payments." },
  );

  addTool(server, "tiktok_connect", {
    title: "Connect a TikTok account",
    description: "Create a shareable TikTok QR login link. Send connect_url to the human and poll tiktok_connect_status while they scan it.",
    inputSchema: {
      account_id: ACCOUNT_ID,
      country: z.string().length(2).optional().describe("ISO-2 country of the VPS/browser exit; keep it close to the scanning human and the account's usual region"),
      tag: z.string().max(64).optional().describe("Optional account group or niche"),
      browser_path: z.string().optional().describe("Optional Chrome/Edge/Brave executable path"),
      timeout_seconds: z.number().int().min(30).max(900).optional(),
    },
  }, (args) => runtime.connect(args as any));

  addTool(server, "tiktok_connect_status", {
    title: "Check TikTok connection",
    description: "Check whether the local browser login completed.",
    inputSchema: { token: z.string().min(1) },
  }, ({ token }) => runtime.connectStatus(token));

  addTool(server, "tiktok_accounts", {
    title: "List TikTok accounts",
    description: "List local persistent TikTok profiles and their session state.",
    inputSchema: { tag: z.string().optional() },
  }, ({ tag }) => runtime.accounts(tag));

  addTool(server, "tiktok_post", {
    title: "Post or schedule a TikTok video",
    description: "Publish a local video through the connected browser profile, or use TikTok's native scheduler.",
    inputSchema: {
      account_id: ACCOUNT_ID,
      caption: z.string().min(1).max(2200),
      video_path: z.string().optional().describe("Local MP4 path; the file stays on this device"),
      video_url: z.string().url().optional(),
      video_base64: z.string().optional(),
      privacy: z.number().int().min(0).max(2).optional(),
      allow_comments: z.boolean().optional(),
      allow_duet: z.boolean().optional(),
      allow_stitch: z.boolean().optional(),
      schedule_at: z.string().optional().describe("ISO-8601 time, roughly 15 minutes to 10 days ahead"),
    },
  }, (args) => {
    requireOne(args, ["video_path", "video_url", "video_base64"]);
    return runtime.post(args);
  });

  addTool(server, "tiktok_operation_status", {
    title: "Check TikTok operation",
    description: "Poll a local browser job until done or failed.",
    inputSchema: { operation_id: z.string().min(1) },
  }, ({ operation_id }) => runtime.operationStatus(operation_id));

  addTool(server, "tiktok_follow", {
    title: "Follow a TikTok user",
    description: "Follow a user from a connected local profile.",
    inputSchema: { account_id: ACCOUNT_ID, target_user: z.string().min(1) },
  }, (args) => runtime.follow(args as any));

  addTool(server, "tiktok_like", {
    title: "Like a TikTok video",
    description: "Like a video from a connected local profile.",
    inputSchema: { account_id: ACCOUNT_ID, video_url: z.string().url() },
  }, (args) => runtime.like(args as any));

  addTool(server, "tiktok_comment", {
    title: "Comment on a TikTok video",
    description: "Publish a comment on a video from a connected local profile.",
    inputSchema: { account_id: ACCOUNT_ID, video_url: z.string().url(), comment_text: z.string().min(1).max(2200) },
  }, (args) => runtime.comment(args as any));

  addTool(server, "tiktok_comment_delete", {
    title: "Delete a TikTok comment",
    description: "Delete one of the connected account's comments on a video, matched by its text.",
    inputSchema: { account_id: ACCOUNT_ID, video_url: z.string().url(), comment_text: z.string().min(1).max(2200) },
  }, (args) => runtime.commentDelete(args as any));

  addTool(server, "tiktok_comments", {
    title: "List TikTok comments",
    description: "Read a video's comment section (authors, text, likes, age) from a connected profile.",
    inputSchema: { account_id: ACCOUNT_ID, video_url: z.string().url(), limit: z.number().int().min(1).max(200).optional() },
  }, (args) => runtime.comments(args as any));

  addTool(server, "tiktok_delete", {
    title: "Delete a TikTok video",
    description: "Delete one of the connected account's videos.",
    inputSchema: { account_id: ACCOUNT_ID, video_url: z.string().url() },
  }, (args) => runtime.delete(args as any));

  addTool(server, "tiktok_update_profile", {
    title: "Update a TikTok profile",
    description: "Update the display name, bio, or both through the local browser.",
    inputSchema: { account_id: ACCOUNT_ID, display_name: z.string().max(30).optional(), bio: z.string().max(80).optional() },
  }, (args) => {
    if (args.display_name === undefined && args.bio === undefined) throw new Error("Pass display_name, bio, or both");
    return runtime.profile(args as any);
  });

  addTool(server, "tiktok_update_avatar", {
    title: "Update a TikTok avatar",
    description: "Set the profile image using a local path, URL, or base64 input.",
    inputSchema: {
      account_id: ACCOUNT_ID,
      image_path: z.string().optional().describe("Local image path; the file stays on this device"),
      image_url: z.string().url().optional(),
      image_base64: z.string().optional(),
    },
  }, (args) => {
    requireOne(args, ["image_path", "image_url", "image_base64"]);
    return runtime.avatar(args);
  });

  addTool(server, "tiktok_analytics", {
    title: "Fetch TikTok analytics",
    description: "Scrape post metrics locally and save a time-series sample.",
    inputSchema: { account_id: ACCOUNT_ID },
  }, (args) => runtime.analytics(args as any));

  addTool(server, "tiktok_series", {
    title: "Read TikTok performance history",
    description: "Read analytics stored on this device or calculate growth over a time window.",
    inputSchema: { account_id: ACCOUNT_ID, video_id: z.string().optional(), hours: z.number().positive().optional() },
  }, (args) => runtime.series(args as any));

  addTool(server, "tiktok_hooks", {
    title: "Analyze TikTok hooks",
    description: "Compare caption openings against mature posts stored locally.",
    inputSchema: {
      account_id: z.string().optional(), tag: z.string().optional(), niche: z.string().optional(),
      caption: z.string().optional(), maturity_days: z.number().positive().optional(), recency_days: z.number().positive().optional(),
    },
  }, (args) => runtime.hooks(args));

  addTool(server, "tiktok_niches", {
    title: "List TikTok niches",
    description: "List suggested account tags for local hook analysis.",
    inputSchema: {},
  }, () => runtime.niches());

  addTool(server, "tiktok_scheduled", {
    title: "List scheduled TikTok posts",
    description: "List native scheduled posts recorded by this local MCP.",
    inputSchema: { account_id: z.string().optional(), include_done: z.boolean().optional() },
  }, (args) => runtime.scheduled(args));

  addTool(server, "tiktok_cancel_scheduled", {
    title: "Cancel a scheduled TikTok post",
    description: "Cancel a native scheduled post by deleting its held video.",
    inputSchema: { operation_id: z.string().min(1), account_id: ACCOUNT_ID },
  }, ({ operation_id, account_id }) => runtime.cancelScheduled(operation_id, account_id));

  return server;
}
