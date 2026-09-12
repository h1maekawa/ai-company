/**
 * 役割とパイプラインの対応（要件3）のテスト
 *
 * この対応表は「実装は分解せず、ラベルだけを与える」方式の要。
 * 表と実態がずれると、タスクログが嘘をつくようになる。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "agents");
const roles = await import(path.join(OUT, "pipelineRoles.js"));
const types = await import(path.join(OUT, "types.js"));

test("ステップIDが重複していない（タスクログの突き合わせに使う）", () => {
  const ids = roles.PIPELINE_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("すべてのステップが実在する役割を指している", () => {
  for (const step of roles.PIPELINE_STEPS) {
    assert.ok(
      step.role in types.AGENT_ROLE_LABELS,
      `${step.id} の役割 ${step.role} が未定義です`
    );
  }
});

test("すべての役割が、対応ステップを持つか未対応として明示されている", () => {
  // 「実装されているつもり」の役割を残さないための検査
  const covered = new Set(roles.PIPELINE_STEPS.map((s) => s.role));
  for (const role of Object.keys(types.AGENT_ROLE_LABELS)) {
    const known = covered.has(role) || roles.ROLES_WITHOUT_PIPELINE_STEP.includes(role);
    assert.ok(known, `${role} が対応表にも未対応リストにもありません`);
  }
});

test("未対応リストに、実際は対応済みの役割が残っていない", () => {
  const covered = new Set(roles.PIPELINE_STEPS.map((s) => s.role));
  for (const role of roles.ROLES_WITHOUT_PIPELINE_STEP) {
    assert.equal(covered.has(role), false, `${role} は対応済みなので未対応リストから外してください`);
  }
});

test("実装の参照先が空でない（読み手がコードへ辿れる）", () => {
  for (const step of roles.PIPELINE_STEPS) {
    assert.ok(step.implementation?.trim(), `${step.id} に implementation がありません`);
    assert.ok(step.label?.trim(), `${step.id} に label がありません`);
  }
});

test("投稿ステップだけが人間承認を必須とする", () => {
  const requiring = roles.PIPELINE_STEPS.filter((s) => s.requiresApproval);
  assert.deepEqual(
    requiring.map((s) => s.id),
    ["publisher.schedule"]
  );
});

test("承認必須のステップの役割は、requiresApprovalBeforeRun と一致する", () => {
  for (const step of roles.PIPELINE_STEPS) {
    assert.equal(
      step.requiresApproval,
      types.requiresApprovalBeforeRun(step.role),
      `${step.id} の承認要否が役割定義とずれています`
    );
  }
});

test("findPipelineStep は未知のIDでundefinedを返す", () => {
  assert.equal(roles.findPipelineStep("no-such-step"), undefined);
  assert.ok(roles.findPipelineStep("writer.generate"));
});

test("自動記録のタスクは origin=automation になる", () => {
  const task = types.createAgentTask({
    role: "writer",
    instruction: "投稿案の生成",
    intent: "自動",
    origin: "automation",
    stepId: "writer.generate",
    status: "done",
  });
  assert.equal(task.origin, "automation");
  assert.equal(task.stepId, "writer.generate");
  assert.equal(task.status, "done");
});

test("チャット由来のタスクは既定で origin=chat・queued", () => {
  const task = types.createAgentTask({ role: "writer", instruction: "書いて", intent: "note" });
  assert.equal(task.origin, "chat");
  assert.equal(task.status, "queued");
});
