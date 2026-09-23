/**
 * Asia/Tokyo の日付helper（SNS事業部で共通に使う）。
 * JSTはDSTが無いため +9h で計算する。queue.ts から使うので依存の重いmoduleをimportしない。
 */
const JST_OFFSET_MS = 9 * 3_600_000;

/** Asia/Tokyo の YYYY-MM-DD */
export function tokyoDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 指定Tokyo日付の 00:00 JST の epoch ms */
export function tokyoDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00+09:00`);
}
