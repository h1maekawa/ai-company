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
    /**
     * 家計。YYYY-MM.md は家計簿アプリの月次集計スナップショットで毎月増える。
     * 個別列挙もディレクトリ走査もせず、{month}/{prevMonth} を loader が
     * 読み込み時にJSTで解決する（＝常に当月＋前月の2枚だけを読む）。
     */
    kakei: [
      "memory/personal/finance/budget-rules.md",
      "memory/personal/kakei/{month}.md",
      "memory/personal/kakei/{prevMonth}.md",
    ],
  },
  working: {
    note: [
      "memory/personal/note/research-inbox.md",
      "memory/personal/note/trend-clusters.md",
      "memory/personal/note/social-drafts.md",
      "memory/personal/note/note-publish-queue.md",
      "memory/personal/note/content-core.md",
      "memory/personal/note/article-sessions.md",
      "memory/personal/note/offers.md",
      "memory/personal/note/cta-library.md",
      "memory/personal/note/monetization-ledger.md",
      "memory/personal/note/learnings.md",
      "memory/personal/note/content-recommendations.md",
      "memory/personal/note/content-plans.md",
      "memory/personal/note/daily-growth-reviews.md",
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
