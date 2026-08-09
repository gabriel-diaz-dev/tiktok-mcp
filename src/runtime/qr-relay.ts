export const LOCATION_GUIDANCE =
  "TikTok may reject QR logins when the agent/VPS browser and the human's phone are far apart. " +
  "Keep both IPs in the same country or a nearby region, ideally the account's usual region. " +
  "If they differ, align the VPS/browser exit first; otherwise the human can temporarily use an allowed VPN/proxy while scanning. " +
  "Keep the runtime exit stable afterward and follow TikTok's Terms.";

export interface QrRelaySession {
  token: string;
  writer: string;
  connect_url: string;
  expires_in_sec: number;
}

function relayOrigin(value?: string): URL {
  const origin = new URL(value || process.env.TIKTOK_CONNECT_RELAY_URL || "https://tiktok.palmyr.ai");
  const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !localHttp) {
    throw new Error("TIKTOK_CONNECT_RELAY_URL must use HTTPS (HTTP is allowed only for localhost development)");
  }
  return origin;
}

export class QrRelayClient {
  private readonly origin: URL;

  constructor(origin?: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.origin = relayOrigin(origin);
  }

  private async request(body: Record<string, unknown>): Promise<QrRelaySession> {
    const endpoint = new URL("/v1/connect/relay", this.origin);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as Partial<QrRelaySession> & { error?: string };
    if (!response.ok) throw new Error(payload.error || `QR relay returned HTTP ${response.status}`);
    if (!payload.token || !payload.writer || !payload.expires_in_sec) throw new Error("QR relay returned an invalid session");
    const connectUrl = payload.connect_url || new URL(`/connect/${payload.token}`, this.origin).toString();
    return {
      token: payload.token,
      writer: payload.writer,
      connect_url: connectUrl,
      expires_in_sec: payload.expires_in_sec,
    };
  }

  create(): Promise<QrRelaySession> {
    return this.request({});
  }

  update(writer: string, qrDataUrl: string): Promise<QrRelaySession> {
    return this.request({ token: writer, qr_data_url: qrDataUrl });
  }

  complete(writer: string): Promise<QrRelaySession> {
    return this.request({ token: writer, done: true });
  }
}
