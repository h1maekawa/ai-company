/**
 * Content Core — Note事業部・X事業部が共有する発信材料の型。
 * Timeboxはこの中の「1つのsourceType」であり、hard dependencyにしない。
 */

export type MaterialType = "note" | "text" | "conversation" | "link" | "task" | "other";

export type MaterialSourceType =
  | "manual"
  | "obsidian"
  | "research"
  | "timebox"
  | "upload"
  | "url"
  | "previous-content";

export type MaterialStatus = "inbox" | "reviewed" | "selected" | "archived";

export type Material = {
  id: string;
  type: MaterialType;
  title: string;
  rawContent: string;
  summary?: string;

  sourceType: MaterialSourceType;
  /** 由来元の識別子（Timeboxのタスクid、Obsidianのvault path、公開済みcontentIdなど） */
  sourceId?: string;
  sourceUrl?: string;

  createdAt: string;
  importedAt?: string;
  updatedAt: string;

  status: MaterialStatus;
};

export function createMaterial(input: {
  type: MaterialType;
  title: string;
  rawContent: string;
  summary?: string;
  sourceType: MaterialSourceType;
  sourceId?: string;
  sourceUrl?: string;
}): Material {
  const now = new Date().toISOString();
  return {
    id: `mat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    title: input.title,
    rawContent: input.rawContent,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    createdAt: now,
    importedAt: input.sourceType === "manual" ? undefined : now,
    updatedAt: now,
    status: "inbox",
  };
}

/* ─── Content Candidate ──────────────────────────────── */

export type ContentCandidateStatus = "suggested" | "approved" | "rejected" | "converted";

export type ContentCandidate = {
  id: string;
  title: string;
  summary: string;

  sourceType: MaterialSourceType;
  sourceIds: string[];

  whyInteresting: string;
  suggestedAngle?: string;
  suggestedCategory?: string;

  /** 裏付け（Material/Research由来の事実のみ。AIが創作した数字・体験を含めない） */
  evidence: string[];

  status: ContentCandidateStatus;
  createdAt: string;
};

export function createContentCandidate(input: {
  title: string;
  summary: string;
  sourceType: MaterialSourceType;
  sourceIds: string[];
  whyInteresting: string;
  suggestedAngle?: string;
  suggestedCategory?: string;
  evidence?: string[];
}): ContentCandidate {
  return {
    id: `cand_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceIds: input.sourceIds,
    whyInteresting: input.whyInteresting,
    suggestedAngle: input.suggestedAngle,
    suggestedCategory: input.suggestedCategory,
    evidence: input.evidence ?? [],
    // AIが作る時点では必ず suggested。approved/converted は本人操作のみが遷移させる
    status: "suggested",
    createdAt: new Date().toISOString(),
  };
}
