/**
 * Promptに常時投入できる長期Memoryの明示的な一覧。
 *
 * Tier 1 (core) だけを通常チャットで読み、Tier 2 (working) は各処理の
 * Storeから必要時に取得する。Tier 3 (archive) は検索時だけ取得する。
 * ディレクトリの再帰読み込みをここへ追加してはいけない。
 */
export const MEMORY_MANIFEST = {
  core: {
    identity: [
      "memory/personal/profile.md",
      "memory/personal/goals.md",
      "memory/personal/rules.md",
      "memory/shared/ai-development-rules.md",
    ],
    note: [
      "memory/personal/note/brand.md",
      "memory/personal/note/kpi.md",
      "memory/personal/note/business-strategy.md",
      "memory/personal/note/research-settings.md",
    ],
    fund: [
      "memory/personal/fund/policy.md",
      "memory/personal/fund/capacity.md",
      "memory/personal/fund/holdings.md",
      "memory/personal/fund/positions.md",
    ],
  },
  working: {
    note: [
      "memory/personal/note/research-inbox.md",
      "memory/personal/note/trend-clusters.md",
      "memory/personal/note/social-drafts.md",
      "memory/personal/note/note-publish-queue.md",
    ],
    fund: [
      "memory/personal/fund/watchlist.md",
      "memory/personal/fund/themes.md",
      "memory/personal/fund/earnings.md",
      "memory/personal/fund/recommendations.md",
      "memory/personal/fund/decisions.md",
    ],
  },
  archive: {
    planning: "memory/personal/planning/",
    noteDrafts: "memory/personal/note/drafts/",
    fundLogs: "memory/personal/fund/investment-log/",
    chatLogs: "memory/chat-log/",
  },
} as const;

