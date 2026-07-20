export type SecretaryScope = {
  local: string[];
  shared: string[];
  global: string[];
};

export const DEFAULT_GLOBAL_SCOPE = [
  "memory/personal/profile.md",
  "memory/shared/ai-development-rules.md"
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
  "executive-kaizen": {
    local: ["memory/kaizen/"],
    shared: ["memory/personal/profile.md", "memory/company/profile.md"],
    global: []
  },

  // ─── Personal OS ──────────────────────────────────────
  "personal-ceo": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/thinking/index.md",
      "memory/personal/goals.md",
      "memory/personal/investment/",
      "memory/personal/finance/",
      "memory/personal/fund/",
      "memory/personal/note/"
    ],
    shared: ["memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-morning": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/goals.md",
      "memory/personal/tasks/",
      "memory/personal/logs/",
      "memory/personal/finance/",
      "memory/personal/investment/",
      "memory/personal/fund/positions.md",
      "memory/personal/note/"
    ],
    shared: ["memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-note": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/note/",
      "memory/personal/note/ideas/index.md",
      "memory/personal/note/affiliates/index.md",
      "memory/personal/note/kpi.md",
      "memory/personal/note/business-strategy.md"
    ],
    shared: ["memory/personal/goals.md", "memory/shared/ai-development-rules.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-finance": {
    local: [
      "memory/personal/rules.md",
      "memory/personal/finance/",
      "memory/personal/investment/",
      "memory/personal/fund/"
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
      "memory/personal/fund/investment-log/"
    ],
    shared: ["memory/personal/goals.md", "memory/shared/ai-development-rules.md"],
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
