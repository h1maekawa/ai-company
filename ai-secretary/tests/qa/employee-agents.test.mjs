/**
 * AI社員モデル（v3.1 §24）のテスト
 *
 * ここは権限の宣言なので、緩む方向の変更を検知することが目的。
 * 「気づいたら全AI社員が書き込み権限を持っていた」を防ぐ。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib");
const agentTypes = await import(path.join(OUT, "company", "agentTypes.js"));
const departments = await import(path.join(OUT, "config", "departments.js"));

const ALL_AGENTS = departments.DEPARTMENTS.flatMap((d) => [
  ...(d.secretaries ?? []),
  ...(d.rooms ?? []).flatMap((r) => r.secretaries),
]);

/* ─── 既定は全拒否 ───────────────────────────────── */

test("【重要】既定の権限は全拒否", () => {
  const perms = agentTypes.denyAllPermissions();
  assert.deepEqual(agentTypes.grantedPermissions(perms), []);
  assert.equal(agentTypes.hasWriteAccess(perms), false);
});

test("【重要】部分指定で未指定のものは拒否のまま（暗黙の許可を作らない）", () => {
  const perms = agentTypes.permissions({ vault: { read: true } });
  assert.equal(perms.vault.read, true);
  assert.equal(perms.vault.write, false);
  assert.equal(perms.github.write, false);
  assert.equal(perms.publish.publish, false);
});

test("許可された権限が group.action の形で列挙される", () => {
  const perms = agentTypes.permissions({ web: { search: true }, vault: { write: true } });
  const granted = agentTypes.grantedPermissions(perms);
  assert.ok(granted.includes("web.search"));
  assert.ok(granted.includes("vault.write"));
  assert.equal(granted.includes("github.write"), false);
});

/* ─── 全AI社員が宣言していること ─────────────────── */

test("すべてのAI社員が kind / riskLevel / permissions を宣言している", () => {
  for (const agent of ALL_AGENTS) {
    assert.ok(agent.kind, `${agent.id} に kind がありません`);
    assert.ok(agent.riskLevel, `${agent.id} に riskLevel がありません`);
    assert.ok(agent.permissions, `${agent.id} に permissions がありません`);
  }
});

test("AI社員が1人以上いる（テストが空振りしていない）", () => {
  assert.ok(ALL_AGENTS.length >= 5, `AI社員が${ALL_AGENTS.length}人しか見つかりません`);
});

/* ─── 緩みの検知 ─────────────────────────────────── */

test("【重要】GitHubへの書き込み権限を持つAI社員はいない", () => {
  // コードを書き換える権限は、自動実装フェーズ（§20-22）で
  // Protected Core の議論を通してから与える
  const writers = ALL_AGENTS.filter((a) => a.permissions.github.write).map((a) => a.id);
  assert.deepEqual(writers, []);
});

test("【重要】公開権限（publish.publish）を持つAI社員はいない", () => {
  // 公開は人の承認を経た後にしか行わない。宣言の時点で持たせない
  const publishers = ALL_AGENTS.filter((a) => a.permissions.publish.publish).map((a) => a.id);
  assert.deepEqual(publishers, []);
});

test("書き込み権限を持つAI社員が R0 になっていない（区分と実態の整合）", () => {
  for (const agent of ALL_AGENTS) {
    if (agentTypes.hasWriteAccess(agent.permissions)) {
      assert.notEqual(agent.riskLevel, "R0", `${agent.id} は書き込めるのに R0 です`);
    }
  }
});

test("R4（AI実行禁止）のAI社員は権限を1つも持たない", () => {
  for (const agent of ALL_AGENTS.filter((a) => a.riskLevel === "R4")) {
    assert.deepEqual(
      agentTypes.grantedPermissions(agent.permissions),
      [],
      `${agent.id} は R4 なのに権限を持っています`
    );
  }
});

/* ─── リスク区分と目標値（§13） ──────────────────── */

test("リスク区分に目標介入率が対応している", () => {
  assert.equal(agentTypes.RISK_INTERVENTION_TARGET.R1, 5);
  assert.equal(agentTypes.RISK_INTERVENTION_TARGET.R2, 15);
  assert.equal(agentTypes.RISK_INTERVENTION_TARGET.R3, 100);
  // R4 はAIが実行しないので目標値を持たない
  assert.equal(agentTypes.RISK_INTERVENTION_TARGET.R4, null);
});

test("すべてのAI社員のリスク区分が定義済みの値である", () => {
  for (const agent of ALL_AGENTS) {
    assert.ok(
      agent.riskLevel in agentTypes.RISK_INTERVENTION_TARGET,
      `${agent.id} の riskLevel ${agent.riskLevel} が未定義です`
    );
  }
});

/* ─── 統一の確認 ─────────────────────────────────── */

test("管理職が1人以上いる（Manager Agentの所在が分かる）", () => {
  assert.ok(ALL_AGENTS.some((a) => a.kind === "manager"));
});

test("AI社員のIDが重複していない", () => {
  const ids = ALL_AGENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});
