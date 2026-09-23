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
export type ResearchArtifact = { id: string; topic: string; summary: string; researchItemIds: string[]; departmentContexts: Record<string, string>; usedBy: Array<{ type: "mission" | "agent" | "content" | "investment-analysis"; id: string }>; createdAt: string;
  /** Research & Intelligence が作る Canonical Artifact の本体。Department cron の要約Artifactには無い。 */
  intelligence?: IntelligenceArtifact };

/* ─── Research & Intelligence（既存Research Platformの拡張。別Storeは作らない） ─── */

export type ResearchIntent = "company_research" | "theme_research" | "platform_research";
export type ResearchPlaybookId = "company-research" | "theme-research" | "platform-research";
export type ResearchPrimaryDepartment = "investment" | "creator" | "shared";
export type ResearchChannel = "x" | "note" | "instagram" | "tiktok";
export type ResearchDepth = "quick" | "standard";

export type ResearchRoutingResult = {
  intent: ResearchIntent;
  /** Research Request / Artifact の重複判定キー。Source item重複の fingerprint とは別物 */
  topicKey: string;
  /** 表示・検索用の人間可読な名前 */
  topic: string;
  primaryDepartment: ResearchPrimaryDepartment;
  playbook: ResearchPlaybookId;
  channel?: ResearchChannel;
  depth: ResearchDepth;
  confidence: number;
  assumption: string;
  userHypothesis?: string;
};

/** Fact単位のSource。LLM自体はSourceにならない。URLは当該実行でProviderが返したものだけ。 */
export type ResearchFact = {
  statement: string;
  source: { url?: string; name?: string; reliability: ResearchReliability; publishedAt?: string; fetchedAt: string };
};
/** facts[] の index */
export type FactRef = number;

export type InvestmentExt = {
  growthDrivers?: { statement: string; factRefs: FactRef[] }[];
  demandChain?: string[];
  valueChain?: string[];
  bottlenecks?: { name: string; constraintTypes: BottleneckConstraint[]; factRefs: FactRef[] }[];
  companies?: {
    name: string; ticker?: string; role: BeneficiaryRole;
    substitutability?: RatingLevel; pricingPower?: RatingLevel;
    durability?: "structural" | "cyclical" | "temporary" | "unknown";
    factRefs: FactRef[];
  }[];
  thesisBreakers?: string[];
  industryKpis?: string[];
  risks?: string[];
};
export const BOTTLENECK_CONSTRAINTS = ["demand_growth", "supply_constraint", "capacity", "lead_time", "technology_barrier", "capex", "switching_cost", "alternative_supplier", "pricing_power", "unknown"] as const;
export type BottleneckConstraint = (typeof BOTTLENECK_CONSTRAINTS)[number];
/** 推奨銘柄ではない。恩恵の受け方の分類だけ */
export const BENEFICIARY_ROLES = ["direct_beneficiary", "supplier", "infrastructure_provider", "equipment_provider", "critical_component", "second_order_beneficiary"] as const;
export type BeneficiaryRole = (typeof BENEFICIARY_ROLES)[number];
export type RatingLevel = "low" | "medium" | "high" | "unknown";

export type SnsExt = { channel?: ResearchChannel; trends?: string[]; formatPatterns?: string[]; hooks?: string[]; opportunities?: string[] };

export type IntelligenceArtifactStatus = "VERIFIED" | "PARTIAL" | "UNVERIFIED";
export type IntelligenceArtifact = {
  topicKey: string;
  originalQuestion: string;
  userHypothesis?: string;
  playbookId: ResearchPlaybookId;
  primaryDepartment: ResearchPrimaryDepartment;
  channel?: ResearchChannel;
  depth: ResearchDepth;
  /** Playbook step ごとの要約。Evidenceの無いstepは作らず unknowns に理由を残す */
  sections: { step: string; summary: string; factRefs: FactRef[] }[];
  facts: ResearchFact[];
  /** AIの解釈。Factとは混ぜない */
  interpretation: string[];
  unknowns: string[];
  asOf: string;
  ttlHours: number;
  status: IntelligenceArtifactStatus;
  investmentExt?: InvestmentExt;
  snsExt?: SnsExt;
  routingAssumption: string;
  refreshedAt?: string;
  knowledgeCapture?: { status: "captured" | "candidate" | "skipped" | "failed"; path?: string; reason?: string };
};
export type CanonicalResearchArtifact = ResearchArtifact & { intelligence: IntelligenceArtifact };
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
