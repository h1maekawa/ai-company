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

// Personal Brain — shared across all secretaries as the top-level identity context
export const PERSONAL_BRAIN_SCOPE = "memory/brain/personal/";
export const COMPANY_BRAIN_SCOPE = "memory/brain/company/";

export const MEMORY_SCOPES: MemoryScopes = {
  // Executive Board — always reads the full Personal Brain & Company Brain
  "executive-coo": {
    local: ["memory/today.md"],
    shared: ["memory/goals.md"],
    global: ["memory/brain/personal/", "memory/brain/company/", "memory/profile.md"]
  },
  "executive-cso": {
    local: ["memory/goals.md"],
    shared: ["memory/brain/personal/", "memory/brain/company/"],
    global: ["memory/profile.md"]
  },
  "executive-cfo": {
    local: ["memory/goals.md"],
    shared: ["memory/brain/personal/", "memory/brain/company/"],
    global: ["memory/profile.md"]
  },

  // Personal Division — reads Personal Brain as global
  "personal-habit": {
    local: ["memory/personal/today.md"],
    shared: ["memory/personal/goals.md"],
    global: ["memory/brain/personal/", "memory/personal/profile.md"]
  },
  "personal-health": {
    local: [],
    shared: ["memory/personal/goals.md"],
    global: ["memory/brain/personal/", "memory/personal/profile.md"]
  },
  "personal-task": {
    local: ["memory/personal/today.md"],
    shared: [],
    global: ["memory/brain/personal/current-focus.md"]
  },
  "personal-study": {
    local: [],
    shared: ["memory/brain/personal/identity.md"],
    global: ["memory/personal/profile.md"]
  },

  // Company Division — strategy reads personal and company brains for context
  "company-strategy": {
    local: ["memory/company/tasks.md"],
    shared: ["memory/company/goals.md"],
    global: [
      "memory/brain/personal/identity.md",
      "memory/brain/personal/goals.md",
      "memory/brain/company/",
      "memory/company/profile.md"
    ]
  },
  "company-recruit": {
    local: ["memory/company/tasks.md"],
    shared: ["memory/brain/personal/identity.md", "memory/brain/company/identity.md"],
    global: ["memory/brain/company/sales-strategy.md", "memory/company/profile.md"]
  },
  "company-crm": {
    local: [],
    shared: ["memory/brain/company/monetization.md"],
    global: ["memory/brain/company/sales-strategy.md", "memory/company/profile.md"]
  },
  "company-dmm": {
    local: ["memory/company/tasks.md"],
    shared: ["memory/brain/company/sales-strategy.md"],
    global: []
  },
  "company-proposal": {
    local: [],
    shared: ["memory/brain/personal/identity.md", "memory/brain/company/identity.md"],
    global: ["memory/brain/company/sales-strategy.md", "memory/company/profile.md"]
  },

  // Finance Division — reads investing brain for intent context
  "finance-strategy": {
    local: ["memory/finance/strategy.md"],
    shared: ["memory/brain/personal/investing.md"],
    global: []
  },
  "finance-market": {
    local: ["memory/finance/watchlist.md"],
    shared: ["memory/brain/personal/investing.md"],
    global: []
  },
  "finance-portfolio": {
    local: ["memory/finance/portfolio.md"],
    shared: ["memory/finance/watchlist.md", "memory/brain/personal/investing.md"],
    global: []
  },
  "finance-earnings": {
    local: ["memory/finance/watchlist.md"],
    shared: ["memory/brain/personal/investing.md"],
    global: []
  },

  // Note Planning Room — reads note-business brain for strategy context
  "note-planning-trend": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md"],
    global: ["memory/brain/personal/current-focus.md"]
  },
  "note-planning-needs": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md"],
    global: []
  },
  "note-planning-winning": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md"],
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

  // Note Monetize Room — reads full note-business brain and monetization maps
  "note-monetize-strategy": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md", "memory/brain/company/monetization.md"],
    global: ["memory/brain/personal/monetization.md", "memory/brain/company/sales-strategy.md"]
  },
  "note-monetize-product": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md", "memory/brain/company/monetization.md"],
    global: ["memory/brain/personal/monetization.md"]
  },
  "note-monetize-funnel": {
    local: ["memory/note/ideas.md"],
    shared: ["memory/brain/personal/note-business.md", "memory/brain/company/monetization.md"],
    global: ["memory/brain/personal/monetization.md", "memory/brain/company/sales-strategy.md"]
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
