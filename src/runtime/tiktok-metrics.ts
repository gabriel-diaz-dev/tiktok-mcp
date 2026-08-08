import { appendMetrics, readMetrics, type StoredMetric } from "./store.js";

export interface ScrapedPost {
  id: string;
  caption?: string | null;
  video_url?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  privacy?: string | null;
  posted_at?: string | null;
}

export type MetricSample = Omit<StoredMetric, "account_id">;

const TIKTOK_EPOCH_FLOOR_MS = Date.UTC(2016, 0, 1);

export function postedAtFromVideoId(videoId: string): string | null {
  if (!/^\d{15,25}$/.test(videoId)) return null;
  try {
    const ms = Number(BigInt(videoId) >> 32n) * 1000;
    if (ms < TIKTOK_EPOCH_FLOOR_MS || ms > Date.now() + 86_400_000) return null;
    return new Date(ms).toISOString();
  } catch { return null; }
}

export function recordSample(
  accountId: string,
  posts: ScrapedPost[],
  sampledAt = new Date().toISOString(),
): { recorded: number; unchanged: number } {
  const current = readMetrics();
  const rows: StoredMetric[] = [];
  let unchanged = 0;
  for (const post of posts) {
    if (!post?.id) continue;
    const previous = current
      .filter((row) => row.account_id === accountId && row.video_id === post.id)
      .sort((a, b) => b.sampled_at.localeCompare(a.sampled_at))[0];
    const views = post.views ?? null;
    const likes = post.likes ?? null;
    const comments = post.comments ?? null;
    if (previous && previous.views === views && previous.likes === likes && previous.comments === comments) {
      unchanged++;
      continue;
    }
    rows.push({
      account_id: accountId,
      video_id: post.id,
      caption: post.caption ?? null,
      video_url: post.video_url ?? null,
      posted_at: post.posted_at ?? postedAtFromVideoId(post.id),
      views, likes, comments,
      privacy: post.privacy ?? null,
      sampled_at: sampledAt,
    });
  }
  appendMetrics(rows);
  return { recorded: rows.length, unchanged };
}

export function seriesFor(accountId: string, videoId: string, limit = 500): MetricSample[] {
  return readMetrics()
    .filter((row) => row.account_id === accountId && row.video_id === videoId)
    .sort((a, b) => a.sampled_at.localeCompare(b.sampled_at))
    .slice(0, limit)
    .map(({ account_id: _accountId, ...row }) => row);
}

export function latestForAccount(accountId: string): MetricSample[] {
  const latest = new Map<string, StoredMetric>();
  for (const row of readMetrics().filter((item) => item.account_id === accountId)) {
    const previous = latest.get(row.video_id);
    if (!previous || row.sampled_at >= previous.sampled_at) latest.set(row.video_id, row);
  }
  return [...latest.values()]
    .sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""))
    .map(({ account_id: _accountId, ...row }) => row);
}

export interface Growth extends MetricSample {
  views_gained: number | null;
  likes_gained: number | null;
  comments_gained: number | null;
  from: string;
  to: string;
  comparable: boolean;
}

export function growthSince(accountId: string, sinceIso: string): Growth[] {
  const byVideo = new Map<string, MetricSample[]>();
  for (const row of readMetrics()) {
    if (row.account_id !== accountId || row.sampled_at < sinceIso) continue;
    const { account_id: _accountId, ...sample } = row;
    const values = byVideo.get(row.video_id) || [];
    values.push(sample);
    byVideo.set(row.video_id, values);
  }
  const diff = (last: number | null, first: number | null) => last == null || first == null ? null : last - first;
  return [...byVideo.values()].map((rows) => {
    rows.sort((a, b) => a.sampled_at.localeCompare(b.sampled_at));
    const first = rows[0], last = rows[rows.length - 1], comparable = rows.length > 1;
    return {
      ...last,
      views_gained: comparable ? diff(last.views, first.views) : null,
      likes_gained: comparable ? diff(last.likes, first.likes) : null,
      comments_gained: comparable ? diff(last.comments, first.comments) : null,
      from: first.sampled_at,
      to: last.sampled_at,
      comparable,
    };
  }).sort((a, b) => (b.views_gained ?? -1) - (a.views_gained ?? -1));
}
