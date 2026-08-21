export type SecretaryScope = {
  local: string[];
  shared: string[];
  global: string[];
};

export const DEFAULT_GLOBAL_SCOPE = [
  MEMORY_MANIFEST.core.identity[0],
  MEMORY_MANIFEST.core.identity[3],
];


export type MemoryScopes = {
  [secretaryId: string]: SecretaryScope;
};

export const MEMORY_SCOPES: MemoryScopes = {
  // ─── Shared / Executive ───────────────────────────────
  // 専属秘書（唯一の窓口）。旧personal-ceoの統括スコープを軽量化して統合。
  // ディレクトリ全読みはコンテキスト肥大の原因になるため、要約系ファイルのみ読む
  "executive-assistant": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/thinking/index.md",
      "memory/personal/fund/holdings.md",
      "memory/personal/fund/capacity.md",
      "memory/personal/note/kpi.md"
    ],
    shared: ["memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md", "memory/personal/goals.md"]
  },
  "executive-inbox": {
    local: [],
    shared: ["memory/personal/profile.md", "memory/company/profile.md"],
    global: []
  },
  "executive-kaizen": {
    local: ["memory/kaizen/"],
    shared: ["memory/personal/profile.md", "memory/company/profile.md"],
    global: []
  },

  // ─── Personal OS ──────────────────────────────────────
  "personal-morning": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/goals.md",
      "memory/personal/fund/positions.md",
      "memory/personal/fund/holdings.md",
      "memory/personal/fund/capacity.md",
      "memory/personal/note/kpi.md"
    ],
    shared: ["memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-note": {
    local: [
      "memory/personal/rules.md",
      ...MEMORY_MANIFEST.core.note
    ],
    shared: ["memory/personal/goals.md", "memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-finance": {
    local: [
      "memory/personal/rules.md",
      ...MEMORY_MANIFEST.core.fund
    ],
    shared: ["memory/personal/goals.md", "memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-fund": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/investment/rules.md",
      "memory/personal/fund/fund.md",
      "memory/personal/fund/rules.md",
      "memory/personal/fund/watchlist.md",
      "memory/personal/fund/portfolio.md",
      "memory/personal/fund/positions.md",
      "memory/personal/fund/themes.md",
      "memory/personal/fund/earnings.md",
      "memory/personal/fund/holdings.md",
      "memory/personal/fund/capacity.md",
      "memory/personal/fund/policy.md",
      "memory/personal/fund/decisions.md"
    ],
    shared: ["memory/personal/goals.md", "memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  }
};

/**
 * Get all memory files to load for a given secretary
 */
export function getScopeForSecretary(secretaryId: string): string[] {
  const scope = MEMORY_SCOPES[secretaryId];
  if (!scope) return [];
  return [...scope.global, ...scope.shared, ...scope.local];
}
import { MEMORY_MANIFEST } from "../memory/manifest";
