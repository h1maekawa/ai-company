import type { OwnedXPost } from "./types";

type ArchiveTweet = {
  tweet?: { id_str?: string; full_text?: string; created_at?: string };
};

export function parseXArchiveTweetsJs(content: string, accountId = "maemichi"): OwnedXPost[] {
  const start = content.indexOf("[");
  if (start < 0) throw new Error("Xアーカイブの投稿配列が見つかりません");
  let rows: ArchiveTweet[];
  try { rows = JSON.parse(content.slice(start)) as ArchiveTweet[]; }
  catch { throw new Error("Xアーカイブの投稿JSONを解析できません"); }
  if (!Array.isArray(rows)) throw new Error("Xアーカイブの投稿形式が不正です");
  const now = new Date().toISOString();
  return rows.flatMap((row) => {
    const tweet = row.tweet;
    if (!tweet?.id_str || !tweet.full_text) return [];
    const postedAt = tweet.created_at ? new Date(tweet.created_at).toISOString() : undefined;
    return [{
      id: `archive_${tweet.id_str}`, accountId, text: tweet.full_text,
      url: undefined, postedAt, source: "x-archive" as const, genreIds: [],
      verifiedByUser: false, finalTextConfirmed: false, createdAt: now, updatedAt: now,
    }];
  });
}

export function isSafeArchiveEntry(name: string): boolean {
  if (name.includes("\0") || name.startsWith("/") || name.startsWith("\\")) return false;
  const parts = name.replace(/\\/g, "/").split("/");
  return !parts.includes("..");
}

export function isTweetArchiveEntry(name: string): boolean {
  if (!isSafeArchiveEntry(name)) return false;
  return /(?:^|\/)data\/tweets(?:-part\d+)?\.js$/i.test(name.replace(/\\/g, "/"));
}
