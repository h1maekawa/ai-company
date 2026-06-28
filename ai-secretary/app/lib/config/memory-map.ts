import { SecretaryMode } from "./modes";

export interface MemoryFileDef {
  name: string;
  path: string;
}

export const MEMORY_MAP: Record<SecretaryMode, MemoryFileDef[]> = {
  personal: [
    { name: "profile.md", path: "memory/personal/profile.md" },
    { name: "goals.md", path: "memory/personal/goals.md" },
    { name: "today.md", path: "memory/personal/today.md" },
  ],
  company: [
    { name: "profile.md", path: "memory/company/profile.md" },
    { name: "goals.md", path: "memory/company/goals.md" },
    { name: "tasks.md", path: "memory/company/tasks.md" },
  ],
  finance: [
    { name: "portfolio.md", path: "memory/personal/fund/portfolio.md" },
    { name: "watchlist.md", path: "memory/personal/fund/watchlist.md" },
    { name: "strategy.md", path: "memory/personal/fund/fund.md" },
  ],
  note: [
    { name: "ideas.md", path: "memory/personal/note/ideas/index.md" },
    { name: "drafts.md", path: "memory/personal/note/drafts" },
  ],
};
