export const CATEGORIES = ["investment", "content", "finance", "ai-company", "engineering", "knowledge", "planning", "personal", "other"] as const;
export type ConversationCategory = typeof CATEGORIES[number];
export type PipelineStatus = "RAW_SAVED" | "AI_REPLIED" | "DERIVED_PENDING" | "DERIVED_SAVED" | "PROMOTION_PENDING" | "COMPLETE" | "FAILED";
export type SlackMemorySource = {
  eventId: string; channel: string; user: string | null; ts: string; threadTs: string | null;
  at: string; permalink: string | null;
};
export type MemoryTurn = {
  id: string; role: "user" | "assistant"; text: string; at: string;
  source: SlackMemorySource; replyToEventId?: string; messageTs?: string;
  inputType: "text" | "audio"; transcript?: string;
  audio?: { id: string | null; filename: string | null; mimetype: string | null };
  redacted: boolean; blockTypes?: string[];
};
export type ExtractedItem = {
  text: string; category: ConversationCategory; sourceEventIds: string[];
  evidence: string; confidence: "explicit" | "inferred"; saveReason: string; decidedAt: string;
};
export type MemoryAnalysis = {
  summary: string; categories: ConversationCategory[]; tags: string[];
  decisions: ExtractedItem[]; nextActions: ExtractedItem[]; knowledgeCandidates: ExtractedItem[];
};
export type ConversationArtifact = {
  version: 1; path: string; channel: string; threadTs: string | null; rootTs: string;
  startedAt: string; updatedAt: string; status: "active" | "summarized" | "archived";
  pipelineStatus: PipelineStatus; turns: MemoryTurn[]; analysis?: MemoryAnalysis;
  analyzedTurnIds: string[]; derived: { kind: "decision" | "task" | "knowledge"; path: string; fingerprint: string }[];
  researchArtifactRefs: string[]; generatedArtifactRefs: string[];
};
export type MemoryOperation =
  | { kind: "turn"; path: string; turn: MemoryTurn }
  | { kind: "transcript"; path: string; turnId: string; text: string; redacted: boolean }
  | { kind: "refs"; path: string; research: string[]; generated: string[] }
  | { kind: "analyze"; path: string; throughTurnId: string; force: boolean; confirmedViewpoint?: string };
export type SlackMemoryWriteJob = {
  id: string; eventId: string; conversationPath: string; fingerprint: string;
  operation: MemoryOperation; attempts: number; lastError?: string;
  status: "pending" | "failed"; nextAttemptAt: string; createdAt: string;
};
export type SlackMemoryRuntime = {
  jobs: SlackMemoryWriteJob[];
  metrics: Record<string, number>;
};
