export const CAREER_DIVISION_ID = "career" as const;
export type CareerEvidenceType = "personal_experience" | "general_advice" | "verified_fact" | "hypothesis";
export type CareerRisk = "clear" | "review_required" | "blocked";
export type CareerKnowledgeItem = {
  id: string; divisionId: typeof CAREER_DIVISION_ID; sourceId: string; title: string; summary: string;
  bodyPrivate: string; topic: string; audience: string; evidenceType: CareerEvidenceType;
  privacyRisk: CareerRisk; verificationStatus: "unverified" | "human_verified"; createdAt: string; updatedAt: string;
};
export type CareerSource = {
  id: string; divisionId: typeof CAREER_DIVISION_ID; sourceType: "transcript" | "note";
  privateUri: string; contentHash: string; language: "ja"; ingestedAt: string;
  retentionPolicy: "private_until_human_deletion"; processingStatus: "processed"; error: null;
};
export type CareerSlide = { position: number; headline: string; body: string };
export type CareerPost = {
  id: string; divisionId: typeof CAREER_DIVISION_ID; batchId: string; knowledgeItemId: string;
  platform: "x" | "instagram"; scheduledAt: string; title: string; body: string; caption: string;
  slides: CareerSlide[]; status: "draft" | "review" | "approved" | "queued" | "published" | "failed" | "cancelled";
  anonymityCheck: CareerRisk; factualityCheck: "clear" | "review_required"; sponsorshipFlag: boolean;
  approvedBy: string | null; approvedAt: string | null; contentHash: string; createdAt: string; updatedAt: string;
};
export type CareerBatch = { id: string; divisionId: typeof CAREER_DIVISION_ID; weekStartDate: string; timezone: "Asia/Tokyo"; generationModel: "local-template-v1"; promptVersion: "career-v1"; status: "draft" | "review"; generatedAt: string; approvedAt: string | null; postIds: string[] };
export type CareerState = { sources: CareerSource[]; knowledgeItems: CareerKnowledgeItem[]; batches: CareerBatch[]; posts: CareerPost[]; audit: Array<{ id: string; divisionId: typeof CAREER_DIVISION_ID; action: string; at: string; details: Record<string, string | number | boolean | null> }> };
