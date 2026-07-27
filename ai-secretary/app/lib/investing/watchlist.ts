/**
 * 監視銘柄リスト（watchlist.md）の読み込み。
 * テーマ見出し（## 🔴 AI半導体）ごとのMarkdown表をそのまま構造化する。
 */

import { getVaultFile } from "../vault";

const WATCHLIST_PATH = "memory/personal/fund/watchlist.md";

export type WatchItem = {
  name: string;
  ticker: string;
  market: string;
  reason: string;
  status: string;
};

export type WatchTheme = {
  theme: string;
  items: WatchItem[];
};

export async function loadWatchlist(): Promise<{
  themes: WatchTheme[];
  updatedAt: string | null;
}> {
  let markdown = "";
  try {
    const file = await getVaultFile(WATCHLIST_PATH);
    markdown = file.content || "";
  } catch {
    return { themes: [], updatedAt: null };
  }
  if (!markdown.trim()) return { themes: [], updatedAt: null };

  const themes: WatchTheme[] = [];
  let current: WatchTheme | null = null;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();

    const heading = trimmed.match(/^##\s+(.*)$/);
    if (heading) {
      if (current && current.items.length > 0) themes.push(current);
      current = { theme: heading[1].trim(), items: [] };
      continue;
    }

    if (!current || !trimmed.startsWith("|")) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === "銘柄名") continue; // ヘッダー行
    if (cells.every((c) => /^-*$/.test(c.replace(/:/g, "")))) continue; // 区切り行

    current.items.push({
      name: cells[0],
      ticker: cells[1] ?? "",
      market: cells[2] ?? "",
      reason: cells[3] ?? "",
      status: cells[4] ?? "",
    });
  }
  if (current && current.items.length > 0) themes.push(current);

  const updatedAt = markdown.match(/最終更新[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return { themes, updatedAt };
}
