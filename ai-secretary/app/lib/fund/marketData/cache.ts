/**
 * 市場データ取得のインメモリキャッシュ（サーバーレスインスタンス単位）。
 * プロバイダー間で共有するため provider.ts から切り出した。
 */

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** 日足バーなど、日中に大きく変わらないデータ向け */
export const BARS_TTL_MS = 15 * 60 * 1000;
/** 直近値・為替向け（表示の鮮度を保つため短め） */
export const QUOTE_TTL_MS = 60 * 1000;

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = BARS_TTL_MS
): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < ttlMs) {
    return hit.value;
  }
  const value = await fn();
  if (value !== null && value !== undefined) {
    cache.set(key, { value, fetchedAt: Date.now() });
  }
  return value;
}

/** テスト用: キャッシュを空にする */
export function clearMarketDataCache(): void {
  cache.clear();
}
