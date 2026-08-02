import { randomUUID } from "crypto";
import { addExperience } from "../research/experience";
import {
  loadNoteQueue,
  loadSocialDrafts,
  saveNoteQueue,
  saveSocialDrafts,
} from "../research/store";
import type { ContentPurpose, NoteArticleDraft, SocialDraft } from "../research/types";
import { decideLocalAiReviewJob, getLocalAiReviewJob } from "./jobs";

function contentPurpose(purpose: string): ContentPurpose {
  if (purpose === "product") return "affiliate";
  if (purpose === "awareness") return "reach";
  return "trust";
}

function titleFrom(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean)
      ?.slice(0, 80) ?? "まえみち添削下書き"
  );
}

export async function adoptLocalAiReview(id: string) {
  const job = await getLocalAiReviewJob(id);
  if (!job || job.status !== "completed" || !job.result) {
    throw new Error("完了した添削だけを採用できます");
  }
  const now = new Date().toISOString();
  const saved: { xDraftId?: string; noteDraftId?: string } = {};

  if (job.input.destination === "x" || job.input.destination === "both") {
    const drafts = await loadSocialDrafts();
    const draft: SocialDraft = {
      id: `local_edit_x_${randomUUID()}`,
      xAccountId: "unassigned",
      purpose: contentPurpose(job.input.purpose),
      genreId: "maemichi",
      text: job.result.xText || job.result.revisedText,
      urls: [],
      needsDisclosure: false,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await saveSocialDrafts([draft, ...drafts]);
    saved.xDraftId = draft.id;
  }

  if (job.input.destination === "note" || job.input.destination === "both") {
    const queue = await loadNoteQueue();
    const text = job.result.noteText || job.result.revisedText;
    const article: NoteArticleDraft = {
      id: `local_edit_note_${randomUUID()}`,
      title: titleFrom(text),
      articleType: "free",
      freeSection: text,
      tags: [],
      affiliateIds: [],
      needsDisclosure: false,
      sourceResearchItemIds: [],
      sourceExperienceIds: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await saveNoteQueue({ ...queue, articles: [article, ...queue.articles] });
    saved.noteDraftId = article.id;
  }

  await decideLocalAiReviewJob(id, "adopted");
  return saved;
}

export async function rejectLocalAiReview(id: string) {
  return decideLocalAiReviewJob(id, "rejected");
}

export async function saveReviewAsUnverifiedExperience(id: string) {
  const job = await getLocalAiReviewJob(id);
  if (!job?.result) throw new Error("添削結果が見つかりません");
  const facts = job.input.additionalFacts;
  await addExperience({
    title: titleFrom(job.input.originalText),
    summary: job.input.originalText.slice(0, 500),
    whatHappened: facts.join("\n"),
    whatWasTried: "",
    reusableFacts: facts,
    sourceType: "manual",
    verifiedByUser: false,
  });
  return { verifiedByUser: false };
}
