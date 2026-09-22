export type ResearchSourceType = "web" | "rss" | "api" | "github" | "runtime" | "market" | "internal";
export type ResearchFreshness = "FRESH" | "STALE" | "UNKNOWN";
export type ResearchReliability = "PRIMARY" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type ResearchQuery = {
  departmentId: string;
  researcherAgentId: string;
  topic: string;
  maxItems: number;
  since?: string;
  freshness?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
};
export type ResearchProviderItem = { title: string; summary: string; sourceUrl?: string; sourceName?: string; publishedAt?: string; reliability?: ResearchReliability; tags?: string[]; relatedKnowledgeIds?: string[] };
export type ResearchProviderResult = { items: ResearchProviderItem[]; warnings?: string[]; checkedAt?: string };
export type ResearchProvider = { id: string; sourceType: ResearchSourceType; search(input: ResearchQuery): Promise<ResearchProviderResult> };

export type DepartmentResearchPolicy = {
  departmentId: string; enabled: boolean; researcherAgentId: string; topics: string[]; sourceTypes: ResearchSourceType[];
  schedule?: string; maxQueriesPerRun: number; maxItemsPerRun: number; maxRuntimeMs: number; freshnessHours: number;
  allowedDomains?: string[]; blockedDomains?: string[]; knowledgeDomains?: string[]; autoKnowledgeCandidate: boolean;
};

export type ResearchItem = {
  id: string; departmentIds: string[]; researcherAgentId: string; topic: string; title: string; summary: string;
  sourceType: ResearchSourceType; sourceUrl?: string; sourceName?: string; publishedAt?: string; fetchedAt: string;
  freshnessStatus: ResearchFreshness; reliability: ResearchReliability; tags: string[]; relatedKnowledgeIds: string[]; fingerprint: string;
  conflictStatus?: "NONE" | "CONFLICTING_SOURCES";
};
export type ResearchArtifact = { id: string; topic: string; summary: string; researchItemIds: string[]; departmentContexts: Record<string, string>; usedBy: Array<{ type: "mission" | "agent" | "content" | "investment-analysis"; id: string }>; createdAt: string };
export type ResearchRun = { id: string; departmentId: string; researcherAgentId: string; startedAt: string; completedAt?: string; queryCount: number; fetchedCount: number; acceptedCount: number; duplicateCount: number; staleCount: number; checkedSources?: string[]; successfulSources?: string[]; failedSources: string[]; status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" };
export type ResearchHealth = { departmentId: string; status: "HEALTHY" | "PARTIAL" | "FAILED" | "UNKNOWN"; lastSuccessfulRun: string | null; lastPartialRun: string | null; lastFailure: string | null; freshItemCount: number; staleItemCount: number; providerFailures: string[] };
export type ResearchCoverageGap = {
  departmentId: string;
  topic: string;
  expectedFreshnessHours: number;
  lastFreshAt?: string;
  ageHours?: number;
  status: "HEALTHY" | "STALE" | "MISSING" | "UNKNOWN";
  providerAvailable: boolean | null;
};
