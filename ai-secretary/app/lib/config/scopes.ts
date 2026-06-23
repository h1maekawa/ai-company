export type SecretaryScope = {
  local: string[];
  shared: string[];
  global: string[];
};

export const DEFAULT_GLOBAL_SCOPE = [
  "memory/personal/profile.md",
  "memory/company/profile.md"
];


export type MemoryScopes = {
  [secretaryId: string]: SecretaryScope;
};

export const MEMORY_SCOPES: MemoryScopes = {
  // ─── Shared / Executive ───────────────────────────────
  "executive-assistant": {
    local: [],
    shared: ["memory/personal/profile.md", "memory/company/profile.md"],
    global: ["memory/personal/goals.md"]
  },
  "executive-inbox": {
    local: [],
    shared: ["memory/personal/profile.md", "memory/company/profile.md"],
    global: []
  },

  // ─── Personal OS ──────────────────────────────────────
  "personal-ceo": {
    local: [
      "memory/personal/thinking/index.md",
      "memory/personal/goals.md",
      "memory/personal/fund/",
      "memory/personal/note/"
    ],
    shared: [],
    global: ["memory/personal/profile.md"]
  },
  "personal-morning": {
    local: [
      "memory/personal/goals.md",
      "memory/personal/fund/positions.md",
      "memory/personal/note/"
    ],
    shared: [],
    global: ["memory/personal/profile.md"]
  },
  "personal-note": {
    local: [
      "memory/personal/note/",
      "memory/personal/note/ideas/index.md",
      "memory/personal/note/affiliates/index.md",
      "memory/personal/note/kpi.md",
      "memory/brain/personal/note-business.md"
    ],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-finance": {
    local: ["memory/personal/finance/"],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-fund": {
    local: [
      "memory/personal/fund/fund.md",
      "memory/personal/fund/rules.md",
      "memory/personal/fund/watchlist.md",
      "memory/personal/fund/portfolio.md",
      "memory/personal/fund/positions.md",
      "memory/personal/fund/themes.md",
      "memory/personal/fund/earnings.md",
      "memory/personal/fund/investment-log/"
    ],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },

  // ─── Company OS ───────────────────────────────────────
  "company-ceo": {
    local: ["memory/company/strategy/index.md"],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "company-system": {
    local: ["memory/company/strategy.md"],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  // Backward compatibility fallbacks
  "crestix-ceo": {
    local: ["memory/company/strategy/index.md"],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "crestix-system": {
    local: ["memory/company/strategy.md"],
    shared: [],
    global: ["memory/company/profile.md"]
  },

  // ─── HD Business Department ────────────────────────────
  "hd-ceo": {
    local: [
      "memory/company/hd-business/",
      "memory/company/strategy/index.md"
    ],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "hd-kpi-manager": {
    local: [
      "memory/company/hd-business/targets.md",
      "memory/company/hd-business/kpi.md",
      "memory/company/hd-business/daily.md",
      "memory/company/hd-business/weekly.md"
    ],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "hd-pipeline-manager": {
    local: [
      "memory/company/hd-business/pipeline.md",
      "memory/company/hd-business/lead-times.md",
      "memory/company/hd-business/targets.md"
    ],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "hd-closing-manager": {
    local: [
      "memory/company/hd-business/pipeline.md",
      "memory/company/hd-business/targets.md",
      "memory/company/hd-business/kpi.md",
      "memory/company/hd-business/lead-times.md"
    ],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "hd-improvement-manager": {
    local: [
      "memory/company/hd-business/bottlenecks.md",
      "memory/company/hd-business/kpi.md",
      "memory/company/hd-business/weekly.md",
      "memory/company/hd-business/playbook.md",
      "memory/company/hd-business/rules.md"
    ],
    shared: [],
    global: ["memory/company/profile.md"]
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
