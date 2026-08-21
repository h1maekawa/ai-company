import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.CONTENT_DIST;
const approval = await import(path.join(DIST, "content/core/approval.js"));
const coreTypes = await import(path.join(DIST, "content/core/types.js"));
const learningTypes = await import(path.join(DIST, "content/learning/types.js"));

test("Viewpoint candidate: AI生成は必ずcandidate（AIが直接approvedを作れない）", () => {
  const vp = approval.candidateViewpoint({
    title: "t", topic: "topic", opinion: "opinion", reasons: [], uncertainties: [],
  });
  assert.equal(vp.status, "candidate");
  assert.equal(vp.verifiedByUser, false);
  assert.equal(vp.approvedAt, undefined);
});

test("Viewpoint承認: approveViewpointを呼んだときだけapprovedになる", () => {
  const vp = approval.candidateViewpoint({ title: "t", topic: "topic", opinion: "op", reasons: [], uncertainties: [] });
  const approved = approval.approveViewpoint(vp);
  assert.equal(approved.status, "approved");
  assert.equal(approved.verifiedByUser, true);
  assert.ok(approved.approvedAt);
});

test("Viewpoint却下: rejectViewpointはapprovedにしない", () => {
  const vp = approval.candidateViewpoint({ title: "t", topic: "topic", opinion: "op", reasons: [], uncertainties: [] });
  const rejected = approval.rejectViewpoint(vp);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.verifiedByUser, false);
});

test("Experience candidate: 本人が言っていない体験をAIが正式化できない（常にcandidate）", () => {
  const exp = approval.candidateExperience({
    title: "t", genres: [], summary: "", whatHappened: "h", whatWasTried: "", sourceType: "conversation", sensitive: false,
  });
  assert.equal(exp.status, "candidate");
  assert.equal(exp.verifiedByUser, false);
});

test("Experience承認: approveExperienceを呼んだときだけapprovedになる", () => {
  const exp = approval.candidateExperience({
    title: "t", genres: [], summary: "", whatHappened: "h", whatWasTried: "", sourceType: "conversation", sensitive: false,
  });
  const approved = approval.approveExperience(exp);
  assert.equal(approved.status, "approved");
  assert.ok(approved.approvedAt);
});

test("ContentCandidate: 作成直後は必ずsuggested", () => {
  const candidate = coreTypes.createContentCandidate({
    title: "t", summary: "s", sourceType: "manual", sourceIds: [], whyInteresting: "w",
  });
  assert.equal(candidate.status, "suggested");
});

test("Learning: AI生成直後は必ずcandidate、承認したときだけapproved（AI推論を事実として保存しない）", () => {
  const learning = learningTypes.createLearningCandidate({
    period: "2026-W32", sourceContentIds: [], sourcePerformanceIds: [],
    observation: "体験型X投稿3件はHow-to投稿よりLink CTRが高かった",
    interpretation: "具体的な本人経験の方が関心を得やすい可能性",
  });
  assert.equal(learning.status, "candidate");
  const approved = learningTypes.approveLearning(learning);
  assert.equal(approved.status, "approved");
  assert.ok(approved.approvedAt);
  const rejected = learningTypes.rejectLearning(learning);
  assert.equal(rejected.status, "rejected");
});
