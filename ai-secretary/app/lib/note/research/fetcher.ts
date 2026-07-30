/**
 * 外部ページの取得と軽量キャッシュ。
 *
 * 方針:
 *  - 大量クロールをしない（1回のリサーチで数十ページまで）
 *  - 同じURLは一定時間キャッシュする
 *  - 1つのソースが落ちてもリサーチ全体を失敗させない
 */

import { redisSafeGet, redisSafeSet } from "../../utils/redis";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

type CacheEntry = { at: number; body: string };

/** プロセス内キャッシュ（Redisが無い環境でも最低限効かせる） */
const memoryCache = new Map<string, CacheEntry>();

function cacheKey(url: string): string {
  return `note:research:page:${Buffer.from(url).toString("base64url").slice(0, 120)}`;
}

export type FetchResult =
  | { ok: true; body: string; cached: boolean }
  | { ok: false; error: string };

/** 1ページ取得。失敗しても例外を投げず、理由を返す */
export async function fetchPage(url: string): Promise<FetchResult> {
  const key = cacheKey(url);
  const now = Date.now();

  const local = memoryCache.get(key);
  if (local && now - local.at < CACHE_TTL_MS) {
    return { ok: true, body: local.body, cached: true };
  }

  const remote = await redisSafeGet<CacheEntry>(key);
  if (remote && now - remote.at < CACHE_TTL_MS) {
    memoryCache.set(key, remote);
    return { ok: true, body: remote.body, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    const entry: CacheEntry = { at: now, body };
    memoryCache.set(key, entry);
    // 本文は大きいので Redis には長すぎるものを載せない
    if (body.length < 400_000) await redisSafeSet(key, entry);
    return { ok: true, body, cached: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得に失敗しました";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/* ─── HTMLからの軽量な抽出（外部パーサに依存しない） ─── */

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** noteのページに埋まっている __NEXT_DATA__ を取り出す（公開情報のみ） */
export function extractNextData<T = unknown>(html: string): T | null {
  const match = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

/** URL全体から安定した短いIDを作る（前方一致による衝突を避ける） */
export function hashId(prefix: string, seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return `${prefix}${hash.toString(36)}`;
}
