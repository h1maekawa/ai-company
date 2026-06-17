export type SecretaryScope = {
  local: string[];
  shared: string[];
  global: string[];
};

export const DEFAULT_GLOBAL_SCOPE = [
  "memory/personal/profile.md",
  "memory/crestix/profile.md"
];


export type MemoryScopes = {
  [secretaryId: string]: SecretaryScope;
};

export const MEMORY_SCOPES: MemoryScopes = {
  // ─── Shared / Executive ───────────────────────────────
  "executive-assistant": {
    local: [],
    shared: ["memory/personal/profile.md", "memory/crestix/profile.md"],
    global: ["memory/personal/goals.md"]
  },
  "executive-inbox": {
    local: [],
    shared: ["memory/personal/profile.md", "memory/crestix/profile.md"],
    global: []
  },

  // ─── Personal OS ──────────────────────────────────────
  "personal-note": {
    local: ["memory/personal/note/"],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-finance": {
    local: ["memory/personal/finance/"],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },

  // ─── Crestix OS ───────────────────────────────────────
  "crestix-system": {
    local: ["memory/crestix/strategy.md"],
    shared: [],
    global: ["memory/crestix/profile.md"]
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
