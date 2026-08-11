/**
 * Critical Note Test（要件 §76）: Timebox完全OFFで
 * Content → Note → AIと話しながら作る → テーマ入力 → Chat → Viewpoint候補 → 本人承認 →
 * Experience候補 → 本人承認 → Angle → Outline → Draft → 本人編集 → Obsidian保存 → Publish Queue
 * までがすべて通ることを確認する。ドメイン層を直接呼び出す統合テスト（実際に一時Vaultへread/write）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-criticalnote-"));
process.env.VAULT_ROOT = VAULT_ROOT;

const DIST = process.env.CONTENT_DIST;
const noteStudioTypes = await import(path.join(DIST, "content/note-studio/types.js"));
const noteStudioStore = await import(path.join(DIST, "content/note-studio/store.js"));
const obsidianDraft = await import(path.join(DIST, "content/note-studio/obsidianDraft.js"));
const approval = await import(path.join(DIST, "content/core/approval.js"));
const timebox = await import(path.join(DIST, "content/core/providers/timebox.js"));
const noteResearchStore = await import(path.join(DIST, "note/research/store.js"));

// 既存のcanonical draft（本人がすでに書いた記事）を1件、事前にVaultへ置いておく。
// 今回のフローがこのファイルをmove/rename/deleteしないことを最後に確認する。
const EXISTING_DRAFT_PATH = "memory/personal/note/drafts/2026-08-03-existing-example.md";
const EXISTING_DRAFT_CONTENT = "---\ntype: note_draft\ntitle: 既存の記事\nstatus: review\n---\n\n# 既存の記事\n\n本文\n";

test.before(() => {
  const full = path.join(VAULT_ROOT, EXISTING_DRAFT_PATH);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, EXISTING_DRAFT_CONTENT, "utf-8");
});

test("1-2. Timebox完全OFFでもNote Studioを開始できる", async () => {
  const available = await timebox.TimeboxContentProvider.isAvailable();
  assert.equal(available, false, "Timeboxは未接続のはず");
});

let session;

test("3-4. テーマ入力してArticleSessionを作成し、Chatで会話する", async () => {
  session = noteStudioTypes.createArticleSession({
    title: "AIで自動化する前に、何を繰り返しているか記録する方が大切だと思った話",
  });
  session = noteStudioTypes.appendMessage(
    session,
    "user",
    "AI会社を作っていて、AIで仕事を自動化するより先に自分の仕事を記録することの方が大切なんじゃないかと思っている。まだ上手く言葉にできていない。"
  );
  session = noteStudioTypes.appendMessage(session, "assistant", "なぜこのテーマを書きたいと思ったんですか？");
  session = noteStudioTypes.appendMessage(session, "user", "AIに任せる前に、自分が何をしているか分かっていないと任せようがないと気づいたから");
  await noteStudioStore.saveSession(session);

  const loaded = await noteStudioStore.loadSession(session.id);
  assert.equal(loaded.stage, "MATERIAL");
  assert.equal(loaded.messages.length, 3);
});

let viewpointId;

test("6-7. Viewpoint候補を作り、本人が承認する", async () => {
  const candidate = approval.candidateViewpoint({
    title: "記録の重要性",
    topic: session.title,
    opinion: "AIで自動化する前に、何を繰り返しているか記録する方が重要",
    reasons: ["自分の仕事を分かっていないとAIに任せようがないから"],
    uncertainties: [],
    sourceMessageIds: session.messages.map((m) => m.id),
    sourceMaterialIds: session.materialIds,
  });
  assert.equal(candidate.status, "candidate", "本人承認前はcandidateのはず");

  const existing = await noteResearchStore.loadViewpoints();
  await noteResearchStore.saveViewpoints([candidate, ...existing]);

  // 本人操作: 合っている、を押す
  const approved = approval.approveViewpoint(candidate);
  assert.equal(approved.status, "approved");
  await noteResearchStore.saveViewpoints([approved, ...existing]);

  const saved = await noteResearchStore.loadViewpoints();
  const found = saved.find((v) => v.id === candidate.id);
  assert.equal(found.status, "approved");
  viewpointId = found.id;

  session = { ...session, viewpointIds: [...session.viewpointIds, viewpointId], stage: "VIEWPOINT" };
  await noteStudioStore.saveSession(session);
});

let experienceId;

test("8-9. Experience候補を作り、本人が承認する", async () => {
  const candidate = approval.candidateExperience({
    title: "記録を残さず自動化を先に進めて失敗した",
    genres: [],
    summary: "AI会社の初期に、記録を残さないままAI自動化を進めた",
    whatHappened: "何を繰り返しているか記録せずに自動化しようとして、結局何を自動化すべきか分からなくなった",
    whatWasTried: "先に自動化ツールを作ろうとした",
    sourceType: "conversation",
    sensitive: false,
    sourceMessageIds: session.messages.map((m) => m.id),
    sourceMaterialIds: session.materialIds,
  });
  assert.equal(candidate.status, "candidate");

  const existing = await noteResearchStore.loadExperiences();
  const approved = approval.approveExperience(candidate);
  await noteResearchStore.saveExperiences([approved, ...existing]);

  const saved = await noteResearchStore.loadExperiences();
  const found = saved.find((e) => e.id === candidate.id);
  assert.equal(found.status, "approved");
  assert.equal(found.verifiedByUser, true);
  experienceId = found.id;

  session = { ...session, experienceIds: [...session.experienceIds, experienceId], stage: "EXPERIENCE" };
  await noteStudioStore.saveSession(session);
});

test("10-11. Angleを選び、Outlineを確定する", async () => {
  session = {
    ...session,
    stage: "OUTLINE",
    angle: "AI時代ほど記録が重要だと思った理由",
    outline: "1. きっかけ\n2. 実際に起きたこと\n3. 気づいたこと\n4. 今の考え",
  };
  await noteStudioStore.saveSession(session);
  const loaded = await noteStudioStore.loadSession(session.id);
  assert.equal(loaded.angle, "AI時代ほど記録が重要だと思った理由");
  assert.ok(loaded.outline.includes("きっかけ"));
});

let draft;

test("12. Draftを作成する（AI生成直後は必ずdraft状態）", async () => {
  const now = new Date().toISOString();
  draft = {
    id: `draft_test_${Date.now()}`,
    title: session.title,
    articleType: "free",
    freeSection: "（AI生成した本文の下書き）",
    tags: [],
    affiliateIds: [],
    needsDisclosure: false,
    sourceResearchItemIds: session.researchIds,
    sourceViewpointIds: session.viewpointIds,
    sourceExperienceIds: session.experienceIds,
    status: "draft",
    articleSessionId: session.id,
    materialIds: session.materialIds,
    createdAt: now,
    updatedAt: now,
  };
  const queue = await noteResearchStore.loadNoteQueue();
  await noteResearchStore.saveNoteQueue({ ...queue, articles: [draft, ...queue.articles] });

  session = { ...session, draftId: draft.id, stage: "DRAFT" };
  await noteStudioStore.saveSession(session);

  const savedQueue = await noteResearchStore.loadNoteQueue();
  const found = savedQueue.articles.find((a) => a.id === draft.id);
  assert.equal(found.status, "draft", "Draft != Published: AI生成直後はdraftのまま");
});

test("13. 本人がDraft本文を編集する", async () => {
  const queue = await noteResearchStore.loadNoteQueue();
  const edited = { ...queue.articles.find((a) => a.id === draft.id), freeSection: "本人が書き直した本文です。" };
  await noteResearchStore.saveNoteQueue({ ...queue, articles: queue.articles.map((a) => (a.id === draft.id ? edited : a)) });

  const savedQueue = await noteResearchStore.loadNoteQueue();
  const found = savedQueue.articles.find((a) => a.id === draft.id);
  assert.equal(found.freeSection, "本人が書き直した本文です。");
  draft = found;
});

test("14. Obsidian（canonical draft path）へ保存し、既存ファイルは一切変更しない", async () => {
  const savedPath = await obsidianDraft.saveDraftToObsidian(draft, session.id);
  assert.ok(fs.existsSync(path.join(VAULT_ROOT, savedPath)), "新しいdraftファイルが作られていること");

  const newContent = fs.readFileSync(path.join(VAULT_ROOT, savedPath), "utf-8");
  assert.match(newContent, /articleSessionId: /);
  assert.match(newContent, /本人が書き直した本文です。/);

  // Vault Safety: 既存のcanonical draftはmove/rename/deleteされず、内容も変わっていない
  const existingStillThere = fs.readFileSync(path.join(VAULT_ROOT, EXISTING_DRAFT_PATH), "utf-8");
  assert.equal(existingStillThere, EXISTING_DRAFT_CONTENT);
});

test("15. Publish Queueに載っている（まだPublishedにはなっていない）", async () => {
  const queue = await noteResearchStore.loadNoteQueue();
  const found = queue.articles.find((a) => a.id === draft.id);
  assert.ok(found, "Publish Queue（note-publish-queue.md）に記事が存在すること");
  assert.notEqual(found.status, "published", "本人が正式に公開操作するまでPublishedにはならない");

  const published = await noteResearchStore.loadPublishedContent();
  assert.equal(published.find((p) => p.draftId === draft.id), undefined, "PublishedContentはまだ作られていない");
});
