import { BUSINESS_DEPARTMENT_NAV } from "@/app/lib/config/navigation";

export type SystemMapNodeKind = "DEPARTMENT" | "SHARED_PLATFORM" | "SHARED_CORE" | "EXTERNAL_PROVIDER" | "HUMAN_GATE";
export type SystemMapConnectionType = "DATA" | "RESEARCH" | "KNOWLEDGE" | "MISSION" | "NOTIFICATION" | "EXTERNAL" | "HUMAN_APPROVAL";
export type SystemMapStatus = "CONNECTED" | "ACTIVE" | "PARTIAL" | "NOT_CONFIGURED" | "ERROR" | "UNKNOWN" | "PLANNED" | "DEFINED";

export type SystemMapNode = {
  id: string;
  label: string;
  icon: string;
  kind: SystemMapNodeKind;
  href?: string;
  description: string;
  humanOnly?: boolean;
  status?: SystemMapStatus;
};

export type SystemMapEdge = {
  id: string;
  from: string;
  to: string;
  type: SystemMapConnectionType;
  purpose: string;
  source: string;
  planned?: boolean;
  status?: SystemMapStatus;
};

export const DEPARTMENT_NODES: SystemMapNode[] = BUSINESS_DEPARTMENT_NAV.map((department) => ({
  id: department.id,
  label: department.id === "fund" ? "Investment" : department.label,
  icon: department.icon,
  kind: "DEPARTMENT",
  href: department.detailHref,
  description: department.description,
  humanOnly: department.id === "fund" || department.id === "engineering",
}));

export const PLATFORM_NODES: SystemMapNode[] = [
  { id: "research", label: "Research & Intelligence", icon: "⌕", kind: "SHARED_PLATFORM", href: "/content/research", description: "取得済みEvidenceからCanonical Research Artifactを作る共有基盤" },
  { id: "knowledge", label: "Knowledge", icon: "🧠", kind: "SHARED_PLATFORM", href: "/knowledge", description: "Inbox → Candidate → Human Approval → Formal Knowledge" },
  { id: "execution", label: "Execution Store", icon: "◆", kind: "SHARED_CORE", href: "/company", description: "Mission・Plan・Steps・Approval・Events・Idempotency" },
  { id: "human", label: "Human Gates", icon: "✋", kind: "HUMAN_GATE", description: "Publish・Investment・Knowledge・Engineeringの最終判断" },
];

export const SYSTEM_MAP_EDGES: SystemMapEdge[] = [
  { id: "research-creator", from: "research", to: "creator", type: "RESEARCH", purpose: "Content ResearchをCreatorへ供給", source: "Research Runtime" },
  { id: "research-fund", from: "research", to: "fund", type: "RESEARCH", purpose: "市場・企業ResearchをInvestmentへ供給", source: "Research Runtime" },
  { id: "research-knowledge", from: "research", to: "knowledge", type: "KNOWLEDGE", purpose: "Research結果をKnowledge Candidateへ", source: "Knowledge Capture" },
  { id: "creator-knowledge", from: "creator", to: "knowledge", type: "KNOWLEDGE", purpose: "Creatorの学びをCandidateとして共有", source: "Content / Knowledge lifecycle" },
  { id: "fund-knowledge", from: "fund", to: "knowledge", type: "KNOWLEDGE", purpose: "投資Researchを共有Knowledgeから参照", source: "Knowledge Router" },
  { id: "execution-creator", from: "execution", to: "creator", type: "MISSION", purpose: "Creator Mission・Steps", source: "Execution Store" },
  { id: "execution-fund", from: "execution", to: "fund", type: "MISSION", purpose: "Investment Research Mission", source: "Execution Store" },
  { id: "execution-operations", from: "execution", to: "operations", type: "MISSION", purpose: "Runtime stateと改善Mission", source: "Execution Store" },
  { id: "execution-planning", from: "execution", to: "planning", type: "MISSION", purpose: "Active / Blocked Missionを計画へ反映", source: "Execution Store" },
  { id: "execution-engineering", from: "execution", to: "engineering", type: "MISSION", purpose: "Engineering Requestの状態", source: "Execution Store" },
  { id: "creator-human", from: "creator", to: "human", type: "HUMAN_APPROVAL", purpose: "Publish / Safety Gate", source: "Approval Gateway" },
  { id: "fund-human", from: "fund", to: "human", type: "HUMAN_APPROVAL", purpose: "GO / WAIT / PASS。No Automatic Trade", source: "Investment Human Gate" },
  { id: "knowledge-human", from: "knowledge", to: "human", type: "HUMAN_APPROVAL", purpose: "Formal KnowledgeへのPromotion", source: "Knowledge lifecycle" },
  { id: "engineering-human", from: "engineering", to: "human", type: "HUMAN_APPROVAL", purpose: "Worker control・merge・deploy", source: "Engineering Gateway" },
  { id: "planning-calendar", from: "planning", to: "google_calendar", type: "EXTERNAL", purpose: "Schedule EngineからCalendarへ", source: "Planning configuration" },
  { id: "creator-buffer", from: "creator", to: "buffer", type: "EXTERNAL", purpose: "X投稿予約", source: "Buffer configuration" },
  { id: "creator-slack", from: "creator", to: "slack", type: "NOTIFICATION", purpose: "Draft / Review通知", source: "Notification Hub" },
  { id: "creator-line", from: "creator", to: "line", type: "NOTIFICATION", purpose: "X運用通知", source: "Notification Hub" },
  { id: "github-engineering", from: "github", to: "engineering", type: "EXTERNAL", purpose: "Issue・PR・Actions", source: "GitHub configuration" },
  { id: "serpapi-research", from: "serpapi", to: "research", type: "DATA", purpose: "Web Research Evidence", source: "Research Provider" },
  { id: "investment-learning", from: "fund", to: "knowledge", type: "KNOWLEDGE", purpose: "Decision OutcomeからRule Candidateへ", source: "Investment Learning", planned: true },
];
