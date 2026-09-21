import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-handoff-"));
const DIST = process.env.CONTENT_DIST;
const handoff = await import(path.join(DIST, "company/execution/contentHandoff.js"));
const store = await import(path.join(DIST, "note/research/store.js"));

const input = {
  parentMissionId: "mission-creator-1", objective: "AI半導体のnote下書きを作る", body: "# AI半導体\n\n本文です。",
  sourceKnowledgeIds: ["knowledge-1"], sourceResearchRefs: ["mission:mission-creator-1:step:creator_research:output"],
  sourceKpiRefs: ["mission:mission-creator-1:step:creator_kpi:output"], now: new Date("2026-09-21T00:00:00.000Z"),
};

test("Workflow outputはLead Review済みContent Draft Candidateになる", () => {
  const candidate = handoff.createContentDraftCandidate(input);
  assert.equal(candidate.status, "CANDIDATE");
  assert.equal(candidate.reviewedByLead, true);
  assert.equal(candidate.contentType, "note");
  assert.equal(candidate.parentMissionId, input.parentMissionId);
  assert.equal(candidate.sourceStepId, "creator_content");
  assert.deepEqual(candidate.sourceKnowledgeIds, ["knowledge-1"]);
});

test("Human承認前・Lead Review前はContent Coreへ登録できない", async () => {
  const candidate = handoff.createContentDraftCandidate(input);
  await assert.rejects(() => handoff.registerApprovedContentDraft(candidate), /HUMAN_APPROVAL_REQUIRED/);
  await assert.rejects(() => handoff.registerApprovedContentDraft({ ...candidate, status: "APPROVED", reviewedByLead: false }), /LEAD_REVIEW_REQUIRED/);
  assert.equal((await store.loadNoteQueue()).articles.length, 0);
});

test("承認済みnote Candidateは既存note Draftへ一度だけ登録しPublish Jobを作らない", async () => {
  const candidate = { ...handoff.createContentDraftCandidate(input), status: "APPROVED" };
  const first = await handoff.registerApprovedContentDraft(candidate, new Date("2026-09-21T01:00:00.000Z"));
  const second = await handoff.registerApprovedContentDraft(first, new Date("2026-09-21T02:00:00.000Z"));
  const queue = await store.loadNoteQueue();
  assert.equal(first.registeredDraftId, second.registeredDraftId);
  assert.equal(queue.articles.filter((item) => item.id === first.registeredDraftId).length, 1);
  assert.equal(queue.jobs.length, 0);
  const draft = queue.articles.find((item) => item.id === first.registeredDraftId);
  assert.equal(draft.status, "draft");
  assert.equal(draft.parentMissionId, input.parentMissionId);
  assert.deepEqual(draft.sourceKnowledgeIds, ["knowledge-1"]);
  assert.equal(draft.freeSection.includes("Knowledge本文"), false);
});

test("承認済みX Candidateは既存Social Draftへ一度だけ登録し公開しない", async () => {
  const candidate = { ...handoff.createContentDraftCandidate({ ...input, parentMissionId: "mission-x", objective: "X投稿を作る" }), status: "APPROVED" };
  const first = await handoff.registerApprovedContentDraft(candidate);
  await handoff.registerApprovedContentDraft(first);
  const drafts = await store.loadSocialDrafts();
  assert.equal(drafts.filter((item) => item.id === first.registeredDraftId).length, 1);
  const draft = drafts.find((item) => item.id === first.registeredDraftId);
  assert.equal(draft.status, "draft");
  assert.equal(draft.bufferPostId, undefined);
  assert.equal(draft.contentDraftCandidateId, candidate.id);
});

test("Publish RequestでもHandoffはDraft登録に留まる", async () => {
  const candidate = handoff.createContentDraftCandidate({ ...input, parentMissionId: "mission-publish", objective: "noteを公開まで進めたい" });
  assert.equal(candidate.outputType, "PUBLISH_REQUEST");
  const registered = await handoff.registerApprovedContentDraft({ ...candidate, status: "APPROVED" });
  const queue = await store.loadNoteQueue();
  assert.equal(queue.articles.find((item) => item.id === registered.registeredDraftId).status, "draft");
  assert.equal(queue.jobs.some((job) => job.articleId === registered.registeredDraftId), false);
});
