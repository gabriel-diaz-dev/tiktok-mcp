import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { profileDir } from "./store.js";

interface CountryProfile { locale: string; timezoneId: string }

const COUNTRY_PROFILES: Record<string, CountryProfile> = {
  us: { locale: "en-US", timezoneId: "America/New_York" },
  ca: { locale: "en-CA", timezoneId: "America/Toronto" },
  gb: { locale: "en-GB", timezoneId: "Europe/London" },
  au: { locale: "en-AU", timezoneId: "Australia/Sydney" },
  de: { locale: "de-DE", timezoneId: "Europe/Berlin" },
  fr: { locale: "fr-FR", timezoneId: "Europe/Paris" },
  es: { locale: "es-ES", timezoneId: "Europe/Madrid" },
  it: { locale: "it-IT", timezoneId: "Europe/Rome" },
  nl: { locale: "nl-NL", timezoneId: "Europe/Amsterdam" },
  br: { locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  mx: { locale: "es-MX", timezoneId: "America/Mexico_City" },
  jp: { locale: "ja-JP", timezoneId: "Asia/Tokyo" },
  kr: { locale: "ko-KR", timezoneId: "Asia/Seoul" },
  in: { locale: "en-IN", timezoneId: "Asia/Kolkata" },
  id: { locale: "id-ID", timezoneId: "Asia/Jakarta" },
  ph: { locale: "en-PH", timezoneId: "Asia/Manila" },
  sg: { locale: "en-SG", timezoneId: "Asia/Singapore" },
  ae: { locale: "en-AE", timezoneId: "Asia/Dubai" },
  sa: { locale: "ar-SA", timezoneId: "Asia/Riyadh" },
};

export function profileForCountry(country?: string): CountryProfile {
  return COUNTRY_PROFILES[(country || "us").toLowerCase()] || COUNTRY_PROFILES.us;
}

const accountLocks = new Map<string, Promise<void>>();

async function lockAccount(accountId: string): Promise<() => void> {
  const previous = accountLocks.get(accountId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  accountLocks.set(accountId, tail);
  await previous;
  return () => {
    release();
    if (accountLocks.get(accountId) === tail) accountLocks.delete(accountId);
  };
}

function defaultHeadless(): boolean {
  if (process.env.TIKTOK_HEADLESS === "true") return true;
  if (process.env.TIKTOK_HEADLESS === "false") return false;
  return process.platform === "linux" && !process.env.DISPLAY;
}

function installedBrowser(): string | undefined {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFiles86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA;
    candidates.push(
      join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFiles86, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(programFiles86, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (local) candidates.push(
      join(local, "Google", "Chrome", "Application", "chrome.exe"),
      join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
      "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge", "/usr/bin/brave-browser",
    );
  }
  return candidates.find((candidate) => existsSync(candidate));
}

type VirtualDisplay = { display: string; process: ChildProcess };

async function startVirtualDisplay(): Promise<VirtualDisplay> {
  const executable = ["/usr/bin/Xvfb", "/usr/local/bin/Xvfb"].find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      "TikTok QR login needs a headed browser. This Linux host has no DISPLAY or Xvfb; install it with `sudo apt-get install -y xvfb`.",
    );
  }
  const number = Array.from({ length: 40 }, (_, index) => 90 + index)
    .find((candidate) => !existsSync(`/tmp/.X11-unix/X${candidate}`));
  if (number === undefined) throw new Error("No free Xvfb display is available for TikTok QR login");
  const display = `:${number}`;
  const child = spawn(executable, [display, "-screen", "0", "1440x900x24", "-nolisten", "tcp"], {
    stdio: "ignore",
    windowsHide: true,
  });
  let spawnError: Error | undefined;
  child.once("error", (error) => { spawnError = error; });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (existsSync(`/tmp/.X11-unix/X${number}`)) return { display, process: child };
    if (spawnError || child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Xvfb did not start for TikTok QR login${spawnError ? `: ${spawnError.message}` : ""}`);
}

export interface LaunchLocalContextOptions {
  accountId: string;
  country?: string;
  cookies?: any[];
  headless?: boolean;
  loadMedia?: boolean;
  browserPath?: string;
  /** Keep a headed login browser out of the operator's way; VPSes use Xvfb. */
  background?: boolean;
}

export interface LocalContext {
  browser: Browser | null;
  ctx: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function launchLocalContext(opts: LaunchLocalContextOptions): Promise<LocalContext> {
  const release = await lockAccount(opts.accountId);
  const profile = profileForCountry(opts.country);
  const headless = opts.headless ?? defaultHeadless();
  let virtualDisplay: VirtualDisplay | undefined;
  if (!headless && process.platform === "linux" && !process.env.DISPLAY) {
    try { virtualDisplay = await startVirtualDisplay(); }
    catch (error) { release(); throw error; }
  }
  const launchOptions: any = {
    headless,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    viewport: { width: 1440, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check",
      ...(opts.background && !virtualDisplay ? ["--start-minimized"] : []),
    ],
  };
  if (virtualDisplay) {
    launchOptions.env = {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      DISPLAY: virtualDisplay.display,
    };
  }
  const browserPath = opts.browserPath || process.env.TIKTOK_BROWSER_PATH || installedBrowser();
  if (browserPath) launchOptions.executablePath = browserPath;
  else if (process.env.TIKTOK_BROWSER_CHANNEL) launchOptions.channel = process.env.TIKTOK_BROWSER_CHANNEL;

  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(profileDir(opts.accountId), launchOptions);
  } catch (error) {
    virtualDisplay?.process.kill();
    release();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nInstall Chromium with \"npx playwright install chromium\", or set TIKTOK_BROWSER_PATH to Chrome/Edge/Brave.`,
    );
  }

  try {
    if (opts.cookies?.length) {
      await ctx.addCookies(opts.cookies.map((cookie) => {
        const { expirationDate, expires, ...rest } = cookie;
        return { ...rest, ...((expirationDate || expires) > 0 ? { expires: expirationDate || expires } : {}) };
      }));
    }
    const pages = ctx.pages();
    const page = pages[0] || await ctx.newPage();
    trackPendingRequests(page);
    await blockHeavyResources(page, opts.loadMedia === true);
    let closed = false;
    return {
      browser: ctx.browser(),
      ctx,
      page,
      close: async () => {
        if (closed) return;
        closed = true;
        try { await ctx.close(); } finally {
          virtualDisplay?.process.kill();
          release();
        }
      },
    };
  } catch (error) {
    await ctx.close().catch(() => {});
    virtualDisplay?.process.kill();
    release();
    throw error;
  }
}

export interface OpenSessionOptions {
  accountId: string;
  proxySessionId?: string;
  cookies: any[];
  country?: string;
  headless?: boolean;
  loadMedia?: boolean;
}

export async function openAuthenticatedSession(opts: OpenSessionOptions): Promise<LocalContext> {
  return launchLocalContext({
    accountId: opts.accountId,
    country: opts.country,
    cookies: opts.cookies,
    headless: opts.headless,
    loadMedia: opts.loadMedia,
  });
}

const MAX_TRACKED = 300;

function trackPendingRequests(page: Page): void {
  const pending = new Map<any, { url: string; method: string; resourceType: string; startedAt: number }>();
  (page as any).__tiktokPending = pending;
  page.on("request", (request) => {
    if (pending.size >= MAX_TRACKED) pending.delete(pending.keys().next().value);
    pending.set(request, {
      url: request.url().slice(0, 300),
      method: request.method(),
      resourceType: request.resourceType(),
      startedAt: Date.now(),
    });
  });
  const done = (request: any) => pending.delete(request);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

export function pendingRequests(page: Page, limit = 12): Array<{ url: string; method: string; resourceType: string; ageMs: number }> {
  const pending: Map<any, any> | undefined = (page as any).__tiktokPending;
  if (!pending) return [];
  const now = Date.now();
  return [...pending.values()]
    .map((item) => ({ ...item, ageMs: now - item.startedAt }))
    .sort((a, b) => b.ageMs - a.ageMs)
    .slice(0, limit);
}

async function blockHeavyResources(page: Page, loadMedia: boolean): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (/mon\.tiktokv\.com|\/monitor_(web|browser)\/|log\.?(tiktokv|byteoversea)\.com/i.test(url)) {
      await route.abort().catch(() => {});
      return;
    }
    if (!loadMedia && ["image", "media", "font"].includes(request.resourceType())) {
      await route.abort().catch(() => {});
      return;
    }
    await route.continue().catch(() => {});
  });
}
