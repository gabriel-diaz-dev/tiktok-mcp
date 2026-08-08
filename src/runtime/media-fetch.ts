import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const mapped = value.replace(/^::ffff:/, "");
  const parts = mapped.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

async function validateUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Media URL must use HTTP or HTTPS");
  if (url.username || url.password) throw new Error("Media URL must not contain credentials");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local media URLs are not allowed");
  if (isIP(url.hostname)) {
    if (privateAddress(url.hostname)) throw new Error("Private-network media URLs are not allowed");
  } else {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
      throw new Error("Media URL resolves to a private network");
    }
  }
  return url;
}

export async function fetchSsrfSafe(
  raw: string,
  opts: { timeoutMs: number; maxBytes: number },
  redirects = 0,
): Promise<Response> {
  if (redirects > 5) throw new Error("Too many media redirects");
  const url = await validateUrl(raw);
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs) });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return response;
    return fetchSsrfSafe(new URL(location, url).toString(), opts, redirects + 1);
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > opts.maxBytes) throw new Error(`Media exceeds ${opts.maxBytes} bytes`);
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > opts.maxBytes) {
      await reader.cancel();
      throw new Error(`Media exceeds ${opts.maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
