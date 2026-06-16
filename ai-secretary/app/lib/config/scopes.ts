export type SecretaryScope = {
  local: string[];
  shared: string[];
  global: string[];
};

export type MemoryScopes = {
  [secretaryId: string]: SecretaryScope;
};

export const DEFAULT_GLOBAL_SCOPE = [
  "memory/profile.md",
  "memory/goals.md",
  "memory/today.md"
];

export const MEMORY_SCOPES: MemoryScopes = {
  // Executive Board
  "executive-coo": {
    local: ["memory/today.md"],
    shared: ["memory/goals.md"],
    global: ["memory/profile.md"]
  },
  "executive-cso": {
    local: ["memory/goals.md"],
    shared: ["memory/profile.md"],
    global: []
  },
  "executive-cfo": {
    local: ["memory/goals.md"],
    shared: ["memory/profile.md"],
    global: []
  },

  // Personal Division
  "personal-habit": {
    local: ["memory/personal/today.md"],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-health": {
    local: [],
    shared: ["memory/personal/goals.md"],
    global: ["memory/personal/profile.md"]
  },
  "personal-task": {
    local: ["memory/personal/today.md"],
    shared: [],
    global: []
  },
  "personal-study": {
    local: [],
    shared: [],
    global: ["memory/personal/profile.md"]
  },

  // Company Division
  "company-strategy": {
    local: ["memory/company/tasks.md"],
    shared: ["memory/company/goals.md"],
    global: ["memory/company/profile.md"]
  },
  "company-recruit": {
    local: ["memory/company/tasks.md"],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "company-crm": {
    local: [],
    shared: [],
    global: ["memory/company/profile.md"]
  },
  "company-dmm": {
    local: ["memory/company/tasks.md"],
    shared: [],
    global: []
  },
  "company-proposal": {
    local: [],
    shared: [],
    global: ["memory/company/profile.md"]
  },

  // Finance Division
  "finance-strategy": {
    local: ["memory/finance/strategy.md"],
    shared: [],
    global: []
  },
  "finance-market": {
    local: ["memory/finance/watchlist.md"],
    shared: [],
    global: []
  },
  "finance-portfolio": {
    local: ["memory/finance/portfolio.md"],
    shared: ["memory/finance/watchlist.md"],
    global: []
  },
  "finance-earnings": {
    local: ["memory/finance/watchlist.md"],
    shared: [],
    global: []
  },

  // Note Planning Room
  "note-planning-trend": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },
  "note-planning-needs": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },
  "note-planning-winning": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },

  // Note Writing Room
  "note-writing-research": {
    local: ["memory/note/research/"],
    shared: ["memory/knowledge/content/"],
    global: ["memory/chat-log/note/"]
  },
  "note-writing-structure": {
    local: ["memory/note/drafts.md"],
    shared: [],
    global: []
  },
  "note-writing-write": {
    local: ["memory/note/drafts.md"],
    shared: [],
    global: []
  },
  "note-writing-title": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },

  // Note Marketing Room
  "note-marketing-seo": {
    local: ["memory/note/drafts.md"],
    shared: [],
    global: []
  },
  "note-marketing-sns": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },
  "note-marketing-cv": {
    local: ["memory/note/drafts.md"],
    shared: [],
    global: []
  },

  // Note Monetize Room
  "note-monetize-strategy": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },
  "note-monetize-product": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },
  "note-monetize-funnel": {
    local: ["memory/note/ideas.md"],
    shared: [],
    global: []
  },

  // System Division
  "system-dev": {
    local: [],
    shared: [],
    global: []
  },
  "system-obsidian": {
    local: [],
    shared: [],
    global: []
  },
  "system-automation": {
    local: [],
    shared: [],
    global: []
  }
};
