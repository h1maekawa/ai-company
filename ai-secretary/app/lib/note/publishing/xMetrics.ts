import type { ContentPerformance, SocialDraft } from "../research/types";

const X_API_BASE = "https://api.x.com/2";
const POST_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;
const POST_MATCH_AMBIGUITY_MS = 5 * 60 * 1000;

type XPost = {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
  };
  non_public_metrics?: {
    engagements?: number;
    user_profile_clicks?: number;
    url_link_clicks?: number;
  };
};

export type XMetricsResult =
  | { ok: true; xPostId: string; metrics: ContentPerformance }
  | { ok: false; retryable: boolean; error: string };

function authToken(): { token: string; userContext: boolean } | null {
  const user = process.env.X_API_USER_ACCESS_TOKEN;
  if (user) return { token: user, userContext: true };
  const app = process.env.X_API_BEARER_TOKEN;
  return app ? { token: app, userContext: false } : null;
}

function normalized(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

export function matchPublishedPost(draft: SocialDraft, posts: XPost[]): XPost | undefined {
  const expected = normalized(draft.text);
  const scheduled = draft.scheduledAt ? new Date(draft.scheduledAt).getTime() : undefined;
  const matches = posts.filter((post) => normalized(post.text) === expected);

  // 投稿時刻がない場合、同一本文を一意に特定できるときだけ採用する。
  if (!Number.isFinite(scheduled)) return matches.length === 1 ? matches[0] : undefined;

  const ranked = matches
    .map((post) => ({
      post,
      distance: Math.abs(new Date(post.created_at ?? "").getTime() - scheduled!),
    }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= POST_MATCH_WINDOW_MS)
    .sort((a, b) => a.distance - b.distance);

  if (ranked.length === 0) return undefined;
  // 同一本文の候補がほぼ同距離なら、誤ったIDを保存するより次回再試行する。
  if (ranked[1] && ranked[1].distance - ranked[0].distance <= POST_MATCH_AMBIGUITY_MS) {
    return undefined;
  }
  return ranked[0].post;
}

async function xFetch(path: string, token: string): Promise<{ ok: true; body: any } | { ok: false; retryable: boolean; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${X_API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message : "X API network error" };
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    return { ok: false, retryable, error: `X API ${response.status}` };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, retryable: true, error: "X API invalid JSON" };
  }
}

export async function fetchXMetrics(draft: SocialDraft, now = new Date()): Promise<XMetricsResult> {
  const auth = authToken();
  const userId = process.env.X_API_USER_ID;
  if (!auth || !userId) return { ok: false, retryable: true, error: "X API credentials are not configured" };

  let xPostId = draft.xPostId;
  if (!xPostId) {
    const timeline = await xFetch(
      `/users/${encodeURIComponent(userId)}/tweets?max_results=100&tweet.fields=created_at`,
      auth.token
    );
    if (timeline.ok === false) return { ok: false, retryable: timeline.retryable, error: timeline.error };
    const matched = matchPublishedPost(draft, Array.isArray(timeline.body.data) ? timeline.body.data : []);
    if (!matched) return { ok: false, retryable: true, error: "published X post is not resolved yet" };
    xPostId = matched.id;
  }

  const fields = auth.userContext ? "public_metrics,non_public_metrics,created_at" : "public_metrics,created_at";
  const result = await xFetch(`/tweets/${encodeURIComponent(xPostId)}?tweet.fields=${fields}`, auth.token);
  if (result.ok === false) return { ok: false, retryable: result.retryable, error: result.error };
  const post = result.body.data as XPost | undefined;
  if (!post) return { ok: false, retryable: true, error: "X API returned no post" };
  return {
    ok: true,
    xPostId,
    metrics: metricsFromPost(draft, post, auth.userContext, now),
  };
}

export function metricsFromPost(
  draft: SocialDraft,
  post: XPost,
  userContext: boolean,
  now = new Date()
): ContentPerformance {
  const publishedAt = post.created_at ?? draft.scheduledAt ?? now.toISOString();
  const age = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000);
  return {
    contentId: draft.id,
    trendClusterId: draft.trendClusterId,
    platform: "x",
    purpose: draft.purpose,
    genreId: draft.genreId,
    publishedAt,
    impressions: post.public_metrics?.impression_count,
    likes: post.public_metrics?.like_count,
    replies: post.public_metrics?.reply_count,
    reposts: post.public_metrics?.retweet_count,
    engagements: post.non_public_metrics?.engagements,
    profileVisits: post.non_public_metrics?.user_profile_clicks,
    noteClicks: post.non_public_metrics?.url_link_clicks,
    measuredAt: now.toISOString(),
    snapshotHours: Math.round(age * 10) / 10,
    metricAvailability: {
      impressions: post.public_metrics?.impression_count === undefined ? "unavailable" : "available",
      likes: post.public_metrics?.like_count === undefined ? "unavailable" : "available",
      replies: post.public_metrics?.reply_count === undefined ? "unavailable" : "available",
      reposts: post.public_metrics?.retweet_count === undefined ? "unavailable" : "available",
      engagements: userContext && post.non_public_metrics?.engagements !== undefined ? "available" : "unavailable",
      profileVisits: userContext && post.non_public_metrics?.user_profile_clicks !== undefined ? "available" : "unavailable",
      noteClicks: userContext && post.non_public_metrics?.url_link_clicks !== undefined ? "available" : "unavailable",
      followersGained: "unavailable",
    },
  };
}
