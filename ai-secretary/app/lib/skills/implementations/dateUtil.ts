/**
 * Shared date helper for Skill implementations.
 * Mirrors the JST-offset computation already used in app/api/fund/log/route.ts
 * so generated Markdown timestamps are consistent across the app.
 */
export function todayJstDateString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nowJstTimeString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

const DAY_OF_WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function jstDayOfWeek(dateStr?: string): string {
  const target = dateStr ?? todayJstDateString();
  const base = new Date(`${target}T00:00:00+09:00`);
  return DAY_OF_WEEK_JA[base.getUTCDay()] ?? "";
}
