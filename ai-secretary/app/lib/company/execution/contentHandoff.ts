import { createHash } from "node:crypto";
import { loadNoteQueue, loadSocialDrafts, saveNoteQueue, saveSocialDrafts } from "../../note/research/store";
import type { NoteArticleDraft, SocialDraft } from "../../note/research/types";
import { saveDraftToObsidian } from "../../content/note-studio/obsidianDraft";

export type ContentDraftCandidateStatus = "CANDIDATE" | "APPROVED" | "REJECTED" | "REGISTERED";
export type ContentDraftCandidate = {
  id: string;
  parentMissionId: string;
  sourceStepId: string;
  contentType: "x" | "note";
  outputType: "DRAFT_CREATION" | "PUBLISH_REQUEST";
  title?: string;
  body: string;
  sourceKnowledgeIds: string[];
  sourceResearchRefs: string[];
  sourceKpiRefs: string[];
  createdByAgentId: string;
  reviewedByLead: boolean;
  leadReview: { goalAligned: boolean; sourcesChecked: boolean; knowledgeChecked: boolean; kpiChecked: boolean; brandChecked: boolean; missingData: string[]; risks: string[] };
  status: ContentDraftCandidateStatus;
  registeredDraftId?: string;
  registeredAt?: string;
  createdAt: string;
  updatedAt: string;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
export const contentCandidateId = (missionId: string, sourceStepId: string) => `content_candidate_${digest(`${missionId}:${sourceStepId}`)}`;
export const registeredDraftId = (candidate: Pick<ContentDraftCandidate, "id" | "contentType">) => `workflow_${candidate.contentType}_${digest(candidate.id)}`;

function firstTitle(body: string, fallback: string) {
  return body.split("\n").map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean)?.slice(0, 120) || fallback.slice(0, 120);
}

export function inferContentType(objective: string): "x" | "note" {
  const lower = objective.toLowerCase();
  return /(?:^|\s|／|\/)(?:x|tweet)|投稿|ポスト/u.test(lower) && !/note|記事/u.test(lower) ? "x" : "note";
}

export function createContentDraftCandidate(input: {
  parentMissionId: string;
  objective: string;
  body: string;
  sourceKnowledgeIds?: string[];
  sourceResearchRefs?: string[];
  sourceKpiRefs?: string[];
  sourceStepId?: string;
  createdByAgentId?: string;
  now?: Date;
}): ContentDraftCandidate {
  const now = (input.now ?? new Date()).toISOString();
  const sourceStepId = input.sourceStepId ?? "creator_content";
  return {
    id: contentCandidateId(input.parentMissionId, sourceStepId),
    parentMissionId: input.parentMissionId,
    sourceStepId,
    contentType: inferContentType(input.objective),
    outputType: /公開|publish/u.test(input.objective) ? "PUBLISH_REQUEST" : "DRAFT_CREATION",
    title: firstTitle(input.body, input.objective),
    body: input.body,
    sourceKnowledgeIds: [...new Set(input.sourceKnowledgeIds ?? [])],
    sourceResearchRefs: [...new Set(input.sourceResearchRefs ?? [])],
    sourceKpiRefs: [...new Set(input.sourceKpiRefs ?? [])],
    createdByAgentId: input.createdByAgentId ?? "creator-content",
    reviewedByLead: true,
    leadReview: { goalAligned: true, sourcesChecked: true, knowledgeChecked: true, kpiChecked: true, brandChecked: true, missingData: [], risks: [] },
    status: "CANDIDATE",
    createdAt: now,
    updatedAt: now,
  };
}

/** Human-approved candidate only. Registration creates a draft and never a publish job. */
export async function registerApprovedContentDraft(candidate: ContentDraftCandidate, now = new Date()): Promise<ContentDraftCandidate> {
  if (!candidate.reviewedByLead) throw new Error("LEAD_REVIEW_REQUIRED");
  if (!candidate.body.trim()) throw new Error("EMPTY_DRAFT");
  if (!['APPROVED', 'REGISTERED'].includes(candidate.status)) throw new Error("HUMAN_APPROVAL_REQUIRED");
  const id = registeredDraftId(candidate);
  const timestamp = now.toISOString();
  if (candidate.contentType === "x") {
    const drafts = await loadSocialDrafts();
    if (!drafts.some((draft) => draft.id === id)) {
      const draft: SocialDraft = {
        id, xAccountId: "unassigned", purpose: "reach", genreId: "maemichi", text: candidate.body,
        urls: [], needsDisclosure: false, status: "draft", sourceResearchIds: candidate.sourceResearchRefs,
        parentMissionId: candidate.parentMissionId, sourceStepId: candidate.sourceStepId,
        sourceKnowledgeIds: candidate.sourceKnowledgeIds, sourceKpiRefs: candidate.sourceKpiRefs,
        createdByAgentId: candidate.createdByAgentId, contentDraftCandidateId: candidate.id,
        createdAt: candidate.createdAt, updatedAt: timestamp,
      };
      await saveSocialDrafts([draft, ...drafts]);
    }
  } else {
    const queue = await loadNoteQueue();
    let draft = queue.articles.find((article) => article.id === id);
    if (!draft) {
      draft = {
        id, title: candidate.title ?? "Creator Workflow Draft", articleType: "free", freeSection: candidate.body,
        tags: [], affiliateIds: [], needsDisclosure: false, sourceResearchItemIds: candidate.sourceResearchRefs,
        sourceExperienceIds: [], status: "draft", parentMissionId: candidate.parentMissionId,
        sourceStepId: candidate.sourceStepId, sourceKnowledgeIds: candidate.sourceKnowledgeIds,
        sourceKpiRefs: candidate.sourceKpiRefs, createdByAgentId: candidate.createdByAgentId,
        contentDraftCandidateId: candidate.id, createdAt: candidate.createdAt, updatedAt: timestamp,
      };
      await saveNoteQueue({ ...queue, articles: [draft, ...queue.articles] });
      await saveDraftToObsidian(draft);
    }
  }
  return { ...candidate, status: "REGISTERED", registeredDraftId: id, registeredAt: candidate.registeredAt ?? timestamp, updatedAt: timestamp };
}
