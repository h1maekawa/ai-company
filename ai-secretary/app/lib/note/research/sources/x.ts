/**
 * Xのリサーチ。2モード。
 *
 * free:
 *   X APIを使わない。公開検索（SerpAPI があれば利用）と、
 *   Slackへ手動で貼った投稿URLの解析だけ。精度は限定的であることを明示する。
 *
 * official-api:
 *   X API v2 で参考アカウントの最近の投稿と、キーワード検索を取得。
 *   月額予算上限を超えたら自動停止し、同じ投稿を同日に何度も取りに行かない。
 */

import { fetchPage, hashId, stripTags } from "../fetcher";
import { redisSafeGet, redisSafeSet } from "../../../utils/redis";
import { ReferenceXAccount, ResearchItem, XResearchSettings } from "../types";
import { detectGenres } from "./note";

export type XResearchResult = {
  items: ResearchItem[];
  failures: { source: string; error: string }[];
  /** このrunで使った推定コスト（USD）。予算集計に足す */
  estimatedCostUsd: number;
  /** モードや予算により実行しなかった場合の理由 */
  skippedReason?: string;
};

const empty = (skippedReason?: string): XResearchResult => ({
  items: [],
  failures: [],
  estimatedCostUsd: 0,
  skippedReason,
});

/* ─── free モード ───────────────────────────── */

type SerpOrganic = { title?: string; link?: string; snippet?: string; date?: string };

/**
 * SerpAPI があれば公開検索から拾う。無ければ何も取れない（＝精度が限定的）。
 * X本体をスクレイピングしにいくことはしない。
 */
async function searchViaSerpApi(query: string): Promise<XResearchResult> {
  if (process.env.SERPAPI_ENABLED !== "true") {
    return empty("無料モードではSerpAPIを呼びません");
  }
  const key = process.env.SERPAPI_KEY;
  if (!key) return empty("SERPAPI_KEY が未設定のため、freeモードでは検索結果を取得できません");

  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
    query
  )}&num=10&api_key=${encodeURIComponent(key)}`;

  const res = await fetchPage(url);
  if (!res.ok) return { items: [], failures: [{ source: query, error: res.error }], estimatedCostUsd: 0 };

  let organic: SerpOrganic[] = [];
  try {
    organic = (JSON.parse(res.body) as { organic_results?: SerpOrganic[] }).organic_results ?? [];
  } catch {
    return { items: [], failures: [{ source: query, error: "検索結果を解析できません" }], estimatedCostUsd: 0 };
  }

  const items: ResearchItem[] = [];
  for (const row of organic) {
    if (!row.link || !row.title) continue;
    if (!/(^|\.)x\.com|twitter\.com/.test(new URL(row.link).hostname)) continue;
    const text = `${row.title} ${row.snippet ?? ""}`;
    items.push({
      id: hashId("r", row.link),
      platform: "x",
      sourceType: "keyword",
      sourceUrl: row.link,
      title: row.title,
      textExcerpt: stripTags(row.snippet ?? row.title).slice(0, 220),
      publishedAt: row.date,
      detectedGenreIds: detectGenres(text),
      fetchedAt: new Date().toISOString(),
    });
  }
  return { items, failures: [], estimatedCostUsd: 0 };
}

/** Slackなどに手で貼られた投稿URLを1件取り込む（本文は人が貼った範囲だけ） */
export function manualXItem(url: string, pastedText: string): ResearchItem {
  return {
    id: hashId("r", url),
    platform: "x",
    sourceType: "manual",
    sourceUrl: url,
    textExcerpt: stripTags(pastedText).slice(0, 220),
    detectedGenreIds: detectGenres(pastedText),
    fetchedAt: new Date().toISOString(),
  };
}

/* ─── official-api モード ───────────────────── */

type XApiTweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    impression_count?: number;
  };
};

type XApiResponse = { data?: XApiTweet[]; errors?: { detail?: string }[] };
type XApiUserResponse = { data?: { id?: string }; errors?: { detail?: string }[] };

/**
 * X APIの概算単価。正確な課金はプランによるため、
 * 「上限を超えたら止める」ための保守的な見積もりとして使う。
 */
const COST_PER_REQUEST_USD = 0.01;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 同じ対象を同じ日に何度も取りに行かない */
async function alreadyFetchedToday(scope: string): Promise<boolean> {
  const key = `note:research:x:${todayKey()}:${scope}`;
  const hit = await redisSafeGet<boolean>(key);
  return hit === true;
}

async function markFetchedToday(scope: string): Promise<void> {
  await redisSafeSet(`note:research:x:${todayKey()}:${scope}`, true);
}

/** X APIを1回叩いて生JSONを返す。失敗しても例外を投げない */
async function callXApiRaw(url: string): Promise<{ json?: unknown; error?: string }> {
  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) return { error: "X_API_BEARER_TOKEN が未設定です" };

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { error: "X APIの認証に失敗しました（401）" };
    if (res.status === 429) return { error: "X APIの利用上限に達しました（429）" };
    if (!res.ok) return { error: `X API エラー: HTTP ${res.status}` };
    return { json: await res.json() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "X APIの呼び出しに失敗しました" };
  }
}

/** 投稿一覧を返すエンドポイント用 */
async function callXApi(url: string): Promise<{ tweets: XApiTweet[]; error?: string }> {
  const { json, error } = await callXApiRaw(url);
  if (error) return { tweets: [], error };
  const body = json as XApiResponse;
  if (body.errors?.length) {
    return { tweets: [], error: body.errors[0].detail ?? "X APIがエラーを返しました" };
  }
  return { tweets: Array.isArray(body.data) ? body.data : [] };
}

/** ハンドルからユーザーIDを引く（data がオブジェクトなので専用に扱う） */
async function lookupUserId(handle: string): Promise<{ id?: string; error?: string }> {
  const { json, error } = await callXApiRaw(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`
  );
  if (error) return { error };
  const body = json as XApiUserResponse;
  if (body.errors?.length) return { error: body.errors[0].detail ?? "ユーザーを取得できません" };
  return body.data?.id ? { id: body.data.id } : { error: "ユーザーIDを取得できませんでした" };
}

function tweetToItem(
  tweet: XApiTweet,
  account?: ReferenceXAccount
): ResearchItem {
  const url = account
    ? `https://x.com/${account.handle}/status/${tweet.id}`
    : `https://x.com/i/status/${tweet.id}`;
  return {
    id: hashId("r", url),
    platform: "x",
    sourceType: account ? "reference-account" : "keyword",
    sourceAccountId: account?.id,
    sourceUrl: url,
    textExcerpt: tweet.text.slice(0, 220),
    authorName: account?.displayName ?? account?.handle,
    publishedAt: tweet.created_at,
    publicMetrics: tweet.public_metrics
      ? {
          likes: tweet.public_metrics.like_count,
          replies: tweet.public_metrics.reply_count,
          reposts: tweet.public_metrics.retweet_count,
          impressions: tweet.public_metrics.impression_count,
        }
      : undefined,
    detectedGenreIds: detectGenres(tweet.text),
    fetchedAt: new Date().toISOString(),
  };
}

async function researchViaOfficialApi(
  accounts: ReferenceXAccount[],
  settings: XResearchSettings
): Promise<XResearchResult> {
  const items: ResearchItem[] = [];
  const failures: { source: string; error: string }[] = [];
  let cost = 0;

  const budgetLeft = () =>
    settings.currentEstimatedSpendUsd + cost < settings.monthlyBudgetUsd;

  const targets = accounts
    .filter((a) => a.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, settings.maxReferenceAccountsPerRun);

  const startTime = new Date(Date.now() - settings.lookbackHours * 3600_000).toISOString();

  for (const account of targets) {
    if (!budgetLeft()) {
      return { items, failures, estimatedCostUsd: cost, skippedReason: "月額予算の上限に達したため停止しました" };
    }
    if (await alreadyFetchedToday(`acct:${account.id}`)) continue;

    // ハンドルからidを引き、そのユーザーの最近の投稿を取る
    const lookup = await lookupUserId(account.handle);
    cost += COST_PER_REQUEST_USD;
    if (lookup.error || !lookup.id) {
      failures.push({ source: `@${account.handle}`, error: lookup.error ?? "ユーザーIDを取得できませんでした" });
      continue;
    }

    const timeline = await callXApi(
      `https://api.x.com/2/users/${lookup.id}/tweets?max_results=${Math.max(
        5,
        settings.maxPostsPerAccount
      )}&start_time=${startTime}&tweet.fields=created_at,public_metrics`
    );
    cost += COST_PER_REQUEST_USD;
    if (timeline.error) {
      failures.push({ source: `@${account.handle}`, error: timeline.error });
      continue;
    }
    for (const tweet of timeline.tweets.slice(0, settings.maxPostsPerAccount)) {
      items.push(tweetToItem(tweet, account));
    }
    await markFetchedToday(`acct:${account.id}`);
  }

  for (const keyword of settings.keywords.slice(0, 5)) {
    if (!budgetLeft()) break;
    if (await alreadyFetchedToday(`kw:${keyword}`)) continue;

    const search = await callXApi(
      `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(
        `${keyword} -is:retweet lang:ja`
      )}&max_results=10&start_time=${startTime}&tweet.fields=created_at,public_metrics`
    );
    cost += COST_PER_REQUEST_USD;
    if (search.error) {
      failures.push({ source: `キーワード:${keyword}`, error: search.error });
      continue;
    }
    for (const tweet of search.tweets) items.push(tweetToItem(tweet));
    await markFetchedToday(`kw:${keyword}`);
  }

  return { items, failures, estimatedCostUsd: cost };
}

/* ─── エントリポイント ───────────────────────── */

export async function researchX(
  accounts: ReferenceXAccount[],
  settings: XResearchSettings
): Promise<XResearchResult> {
  if (!settings.enabled) return empty("Xリサーチが無効になっています");

  if (settings.mode === "official-api") {
    if (process.env.X_API_ENABLED !== "true") {
      return empty("無料モードではX APIを呼びません");
    }
    if (settings.currentEstimatedSpendUsd >= settings.monthlyBudgetUsd) {
      return empty("月額予算の上限に達しているため、X APIを呼びませんでした");
    }
    return researchViaOfficialApi(accounts, settings);
  }

  // free モード: 公開検索のみ
  const items: ResearchItem[] = [];
  const failures: { source: string; error: string }[] = [];
  const queries = [
    ...settings.keywords.slice(0, 3).map((k) => `site:x.com ${k}`),
    ...accounts
      .filter((a) => a.active)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map((a) => `site:x.com ${a.handle}`),
  ];

  if (queries.length === 0) {
    return empty("キーワードも参考アカウントも未登録のため、検索していません");
  }

  for (const query of queries) {
    const result = await searchViaSerpApi(query);
    if (result.skippedReason) return empty(result.skippedReason);
    items.push(...result.items);
    failures.push(...result.failures);
  }

  const byUrl = new Map<string, ResearchItem>();
  for (const item of items) if (!byUrl.has(item.sourceUrl)) byUrl.set(item.sourceUrl, item);

  return { items: [...byUrl.values()], failures, estimatedCostUsd: 0 };
}
