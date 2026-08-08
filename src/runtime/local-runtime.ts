import { randomUUID } from "node:crypto";
import {
  analyzePosts,
  deleteVideo,
  followUser,
  likeVideo,
  postVideo,
  updateAvatar,
  updateProfile,
  type TikTokOpRequest,
  type TikTokOpResult,
} from "./tiktok-operations.js";
import { checkCaption, hookReport } from "./tiktok-hooks.js";
import { NICHES } from "./tiktok-niches.js";
import { growthSince, latestForAccount, seriesFor } from "./tiktok-metrics.js";
import { launchLocalContext } from "./social-runtime.js";
import {
  getAccount,
  getOperation,
  listAccounts,
  listOperations,
  putOperation,
  upsertAccount,
  type LocalOperation,
} from "./store.js";

type OperationResult = TikTokOpResult<any>;

function safeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (key.endsWith("_base64")) return [key, `<${typeof value === "string" ? value.length : 0} base64 characters omitted>`];
    return [key, value];
  }));
}

function operationView(operation: LocalOperation) {
  return {
    operation_id: operation.id,
    operation: operation.name,
    account_id: operation.account_id,
    status: operation.status,
    done: ["done", "failed", "cancelled"].includes(operation.status),
    result: operation.result,
    error: operation.error,
    error_code: operation.error_code,
    created_at: operation.created_at,
    updated_at: operation.updated_at,
  };
}

export class LocalTikTokRuntime {
  connect(input: { account_id: string; country?: string; tag?: string; browser_path?: string; timeout_seconds?: number }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const operation: LocalOperation = {
      id,
      name: "connect",
      account_id: input.account_id,
      status: "pending",
      input: safeInput(input),
      created_at: now,
      updated_at: now,
    };
    putOperation(operation);
    upsertAccount({ id: input.account_id, country: input.country, tag: input.tag, status: "connecting" });
    void this.runConnect(operation, input);
    return {
      token: id,
      operation_id: id,
      status: "pending",
      browser_opening: true,
      message: "A local browser window is opening. Log in or scan TikTok's QR code, then poll tiktok_connect_status.",
    };
  }

  private async runConnect(
    operation: LocalOperation,
    input: { account_id: string; country?: string; tag?: string; browser_path?: string; timeout_seconds?: number },
  ): Promise<void> {
    operation.status = "running";
    operation.updated_at = new Date().toISOString();
    putOperation(operation);
    let session;
    try {
      session = await launchLocalContext({
        accountId: input.account_id,
        country: input.country,
        headless: false,
        loadMedia: true,
        browserPath: input.browser_path,
      });
      await session.page.goto("https://www.tiktok.com/login/qrcode", { waitUntil: "domcontentloaded", timeout: 60_000 });
      const deadline = Date.now() + Math.min(Math.max(input.timeout_seconds || 300, 30), 900) * 1000;
      let authenticated = false;
      while (Date.now() < deadline) {
        const cookies = await session.ctx.cookies("https://www.tiktok.com");
        authenticated = cookies.some((cookie) => cookie.name === "sessionid" && cookie.value.length > 10);
        if (authenticated) break;
        if (session.page.isClosed()) throw new Error("The login browser was closed before TikTok connected");
        await session.page.waitForTimeout(1_000);
      }
      if (!authenticated) throw new Error("TikTok login timed out before a session was detected");
      const connectedAt = new Date().toISOString();
      upsertAccount({
        id: input.account_id,
        country: input.country,
        tag: input.tag,
        status: "active",
        last_connected_at: connectedAt,
        last_error: undefined,
      });
      operation.status = "done";
      operation.result = { connected: true, account_id: input.account_id };
      operation.updated_at = connectedAt;
      putOperation(operation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      upsertAccount({ id: input.account_id, country: input.country, tag: input.tag, status: "logged_out", last_error: message });
      operation.status = "failed";
      operation.error = message;
      operation.error_code = "LOGIN_FAILED";
      operation.updated_at = new Date().toISOString();
      putOperation(operation);
    } finally {
      await session?.close().catch(() => {});
    }
  }

  connectStatus(token: string) {
    const operation = getOperation(token);
    if (!operation || operation.name !== "connect") throw new Error(`Unknown connect token: ${token}`);
    return operationView(operation);
  }

  accounts(tag?: string) {
    const accounts = listAccounts(tag);
    return { count: accounts.length, accounts };
  }

  operationStatus(id: string) {
    const operation = getOperation(id);
    if (!operation) throw new Error(`Unknown operation_id: ${id}`);
    return operationView(operation);
  }

  private common(accountId: string): TikTokOpRequest {
    const account = getAccount(accountId);
    if (!account) throw new Error(`TikTok account \"${accountId}\" is not connected; call tiktok_connect first`);
    if (account.status !== "active") throw new Error(`TikTok account \"${accountId}\" is ${account.status}; reconnect it first`);
    return { account_id: accountId, country: account.country, cookies: [] };
  }

  private start(
    name: string,
    accountId: string,
    input: Record<string, unknown>,
    run: (common: TikTokOpRequest) => Promise<OperationResult>,
  ) {
    const common = this.common(accountId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const operation: LocalOperation = {
      id,
      name,
      account_id: accountId,
      status: "pending",
      input: safeInput(input),
      created_at: now,
      updated_at: now,
    };
    putOperation(operation);
    void (async () => {
      operation.status = "running";
      operation.updated_at = new Date().toISOString();
      putOperation(operation);
      try {
        const response = await run(common);
        operation.status = response.success ? "done" : "failed";
        operation.result = response.data;
        operation.error = response.error;
        operation.error_code = response.error_code;
        if (response.error_code === "SESSION_EXPIRED") {
          upsertAccount({ ...getAccount(accountId)!, id: accountId, status: "logged_out", last_error: response.error });
        }
      } catch (error) {
        operation.status = "failed";
        operation.error = error instanceof Error ? error.message : String(error);
        operation.error_code = "UNKNOWN";
      }
      operation.updated_at = new Date().toISOString();
      putOperation(operation);
    })();
    return { operation_id: id, status: "pending", poll_with: "tiktok_operation_status" };
  }

  post(input: Record<string, any>) {
    return this.start("post", input.account_id, input, (common) => postVideo({ ...common, ...input } as any));
  }

  follow(input: { account_id: string; target_user: string }) {
    return this.start("follow", input.account_id, input, (common) => followUser({ ...common, ...input }));
  }

  like(input: { account_id: string; video_url: string }) {
    return this.start("like", input.account_id, input, (common) => likeVideo({ ...common, ...input }));
  }

  delete(input: { account_id: string; video_url: string }) {
    return this.start("delete", input.account_id, input, (common) => deleteVideo({ ...common, ...input }));
  }

  profile(input: { account_id: string; display_name?: string; bio?: string }) {
    return this.start("profile", input.account_id, input, (common) => updateProfile({ ...common, ...input }));
  }

  avatar(input: Record<string, any>) {
    return this.start("avatar", input.account_id, input, (common) => updateAvatar({ ...common, ...input }));
  }

  analytics(input: { account_id: string }) {
    return this.start("analytics", input.account_id, input, (common) => analyzePosts(common));
  }

  series(input: { account_id: string; video_id?: string; hours?: number }) {
    this.common(input.account_id);
    if (input.video_id) return { account_id: input.account_id, video_id: input.video_id, samples: seriesFor(input.account_id, input.video_id) };
    if (input.hours) {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000).toISOString();
      return { account_id: input.account_id, since, growth: growthSince(input.account_id, since) };
    }
    return { account_id: input.account_id, posts: latestForAccount(input.account_id) };
  }

  hooks(input: { account_id?: string; tag?: string; niche?: string; caption?: string; maturity_days?: number; recency_days?: number }) {
    const tag = input.tag || input.niche;
    if (input.account_id) this.common(input.account_id);
    const report = hookReport({
      owner: "local",
      accountId: input.account_id,
      tag,
      maturityDays: input.maturity_days,
      recencyDays: input.recency_days,
    });
    return input.caption
      ? { report, caption: checkCaption({ owner: "local", accountId: input.account_id, tag, caption: input.caption }) }
      : report;
  }

  niches() {
    return { count: NICHES.length, niches: NICHES.map(({ id, label, aliases }) => ({ id, label, aliases })) };
  }

  scheduled(input: { account_id?: string; include_done?: boolean }) {
    const now = Date.now();
    const posts = listOperations().filter((operation) => {
      if (operation.name !== "post" || !operation.input.schedule_at) return false;
      if (input.account_id && operation.account_id !== input.account_id) return false;
      return input.include_done || operation.status === "pending" || operation.status === "running" ||
        (operation.status === "done" && Date.parse(String(operation.input.schedule_at)) > now);
    }).map((operation) => ({
      operation_id: operation.id,
      account_id: operation.account_id,
      schedule_at: operation.input.schedule_at,
      caption: operation.input.caption,
      state: operation.status === "cancelled" ? "cancelled" : operation.status === "failed" ? "failed" :
        operation.status === "done" && Date.parse(String(operation.input.schedule_at)) <= now ? "due" : "scheduled",
      video_url: (operation.result as any)?.video_url,
      created_at: operation.created_at,
    }));
    return {
      count: posts.length,
      posts,
      note: "This is the local MCP's record. Changes made directly in TikTok Studio are not visible here.",
    };
  }

  cancelScheduled(operationId: string, accountId: string) {
    const target = getOperation(operationId);
    if (!target || target.name !== "post" || !target.input.schedule_at || target.account_id !== accountId) {
      throw new Error(`Scheduled operation not found: ${operationId}`);
    }
    const videoUrl = (target.result as any)?.video_url;
    if (!videoUrl) throw new Error("This scheduled post has no recorded video URL; delete it in TikTok Studio");
    return this.start("cancel_scheduled", accountId, { operation_id: operationId, video_url: videoUrl }, async (common) => {
      const result = await deleteVideo({ ...common, video_url: videoUrl });
      if (result.success) {
        target.status = "cancelled";
        target.updated_at = new Date().toISOString();
        putOperation(target);
      }
      return result;
    });
  }
}
