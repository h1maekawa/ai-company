import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const orchestrator = await import(path.join(DIST, "integrations/slack/orchestrator.js"));

test("複合依頼をリサーチ→X・note生成の構造化タスクにする", async () => {
  const planner = async () => JSON.stringify({
    version: 1,
    actions: ["research", "generate_x", "generate_note"],
    topic: "生成AIニュース",
    destination: "both",
    articleType: "free",
    publishRequested: false,
    confidence: 0.96,
  });
  const result = await orchestrator.orchestrateSlackMessage(
    "生成AIニュースを調べて、Xとnoteの両方を作って",
    {},
    planner
  );
  assert.equal(result.plan.source, "ai");
  assert.deepEqual(result.plan.actions, ["research", "generate_x", "generate_note"]);
  assert.deepEqual(result.intent, {
    type: "research",
    topic: "生成AIニュース",
    destination: "both",
  });
});

test("AIが公開を要求しても公開承認には変換せずpublish意図だけにする", async () => {
  const planner = async () => JSON.stringify({
    version: 1,
    actions: ["request_publish"],
    publishRequested: true,
    scheduleText: "明日朝",
    confidence: 0.99,
  });
  const result = await orchestrator.orchestrateSlackMessage("明日の朝に公開して", {}, planner);
  assert.equal(result.plan.publishRequested, true);
  assert.deepEqual(result.intent, { type: "publish" });
});

test("本人の感想をviewpoint回答として構造化する", async () => {
  const planner = async () => JSON.stringify({
    version: 1,
    actions: ["capture_viewpoint"],
    publishRequested: false,
    confidence: 0.93,
  });
  const result = await orchestrator.orchestrateSlackMessage(
    "私は便利だと思うけど、企業の情報管理は少し心配です",
    { status: "awaiting-viewpoint" },
    planner
  );
  assert.equal(result.intent.type, "answer");
  assert.match(result.intent.text, /情報管理/);
});

test("壊れたJSON・低信頼・AI失敗時は既存ルールへ安全に戻る", async () => {
  const broken = await orchestrator.orchestrateSlackMessage("半導体について調べて", {}, async () => "not-json");
  assert.equal(broken.plan.source, "rules");
  assert.equal(broken.intent.type, "research");

  const low = await orchestrator.orchestrateSlackMessage("下書きを見せて", {}, async () => JSON.stringify({
    version: 1,
    actions: ["help"],
    publishRequested: false,
    confidence: 0.2,
  }));
  assert.equal(low.intent.type, "draft");

  const failed = await orchestrator.orchestrateSlackMessage("設定を教えて", {}, async () => {
    throw new Error("provider unavailable");
  });
  assert.equal(failed.intent.type, "settings");
});

test("未知のactionや範囲外の候補番号は採用しない", () => {
  const plan = orchestrator.parseSlackTaskPlan(JSON.stringify({
    version: 1,
    actions: ["delete_everything", "generate_note"],
    candidateNumber: 99,
    topic: "AI",
    publishRequested: false,
    confidence: 0.9,
  }));
  assert.deepEqual(plan.actions, ["generate_note"]);
  assert.equal(plan.candidateNumber, undefined);
});
