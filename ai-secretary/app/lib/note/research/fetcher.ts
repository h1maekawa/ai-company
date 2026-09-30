/**
 * 外部ページの取得と軽量キャッシュ。
 *
 * 方針:
 *  - 大量クロールをしない（1回のリサーチで数十ページまで）
 *  - 同じURLは一定時間キャッシュする
 *  - 1つのソースが落ちてもリサーチ全体を失敗させない
 */

import { createHash } from "node:crypto";
import { getRedisClient, redisSafeGet } from "../../utils/redis";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 400_000;
const MAX_MEMORY_ENTRIES = 64;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

type CacheEntry = { at: number; body: string };

/** プロセス内キャッシュ（Redisが無い環境でも最低限効かせる） */
const memoryCache = new Map<string, CacheEntry>();

function cacheKey(url: string): string {
  return `note:research:page:${createHash("sha256").update(url).digest("hex")}`;
}
function remember(key: string, entry: CacheEntry) {
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  while (memoryCache.size > MAX_MEMORY_ENTRIES) memoryCache.delete(memoryCache.keys().next().value!);
}
async function readLimited(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
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
    remember(key, local);
    return { ok: true, body: local.body, cached: true };
  }

  const remote = await redisSafeGet<CacheEntry>(key);
  if (remote && now - remote.at < CACHE_TTL_MS) {
    remember(key, remote);
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
    const body = await readLimited(res);
    const entry: CacheEntry = { at: now, body };
    remember(key, entry);
    try { await getRedisClient()?.set(key, entry, { ex: Math.ceil(CACHE_TTL_MS / 1000) }); } catch { /* cache is best effort */ }
    return { ok: true, body, cached: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message === "RESPONSE_TOO_LARGE" ? "RESPONSE_TOO_LARGE" : "FETCH_FAILED" };
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
