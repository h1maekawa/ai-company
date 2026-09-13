/**
 * Task Signature（v3.1 Phase 3 §4 / §5）のテスト
 *
 * 反復検出の精度はここで決まる。
 * 落としすぎれば別の仕事が混ざり、落とし足りなければ反復がすり抜ける。
 * 両方向を固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company", "evolution");
const sig = await import(path.join(OUT, "signature.js"));

const ev = (over = {}) => ({
  id: "e1",
  at: "2026-09-13T00:00:00Z",
  kind: "task.completed",
  department: "sales",
  actor: "sales-agent",
  action: "商談後のフォローメールを作って",
  outcome: "success",
  signature: "x",
  humanIntervention: false,
  ...over,
});

/* ─── 固有名詞・日付の除去 ───────────────────────── */

test("【重要】人名が違っても同じ仕事として扱う", () => {
  const a = sig.buildTaskSignature(ev({ action: "山田様への商談後メールを作って" }));
  const b = sig.buildTaskSignature(ev({ action: "佐藤様への商談後メール作って" }));
  const c = sig.buildTaskSignature(ev({ action: "田中さんに商談後のお礼メール" }));
  assert.equal(a.normalizedIntent, b.normalizedIntent);
  assert.equal(b.normalizedIntent, c.normalizedIntent);
  assert.equal(a.operation, "followup_email");
});

test("日付・時刻・URL・数値を落とす", () => {
  assert.equal(
    sig.normalizeText("2026-09-13 14:30 に https://x.com/a を3件"),
    sig.normalizeText("2026-01-01 09:00 に https://y.com/b を12件")
  );
});

test("会社名を落とす", () => {
  assert.equal(
    sig.normalizeText("株式会社サンプルへの提案書"),
    sig.normalizeText("株式会社テストへの提案書")
  );
});

test("【重要】別の仕事は別のsignatureになる（混ぜない）", () => {
  const mail = sig.buildTaskSignature(ev({ action: "商談後のメールを作って" }));
  const research = sig.buildTaskSignature(ev({ action: "競合の調査をして" }));
  assert.notEqual(mail.normalizedIntent, research.normalizedIntent);
});

test("生文章そのものをIDにしない", () => {
  const s = sig.buildTaskSignature(ev({ action: "山田様への商談後メールを作って" }));
  assert.doesNotMatch(s.normalizedIntent, /山田/);
  assert.doesNotMatch(sig.signatureKey(s), /山田/);
});

/* ─── operation の分類 ───────────────────────────── */

test("分類できないものは other になる（無理に分類しない）", () => {
  const s = sig.buildTaskSignature(ev({ action: "あれをいい感じにしておいて" }));
  assert.equal(s.operation, "other");
  assert.equal(sig.isClassified(s), false);
});

test("Skillが記録されていれば文面よりSkillを信頼する", () => {
  const s = sig.buildTaskSignature(ev({ action: "適当な文面", skillId: "note-draft-format" }));
  assert.equal(s.operation, "skill:note-draft-format");
});

test("医療リサーチと一般リサーチを分ける", () => {
  const medical = sig.buildTaskSignature(ev({ action: "医療制度の調査をして" }));
  const general = sig.buildTaskSignature(ev({ action: "競合の調査をして" }));
  assert.equal(medical.operation, "medical_research");
  assert.notEqual(medical.operation, general.operation);
});

/* ─── signatureVersion（§5） ─────────────────────── */

test("signatureVersion を持つ", () => {
  const s = sig.buildTaskSignature(ev());
  assert.equal(s.signatureVersion, sig.SIGNATURE_VERSION);
  assert.ok(sig.SIGNATURE_VERSION.length > 0);
});

test("【重要】集計キーにバージョンが含まれる（旧ルールと混ざらない）", () => {
  const s = sig.buildTaskSignature(ev());
  assert.match(sig.signatureKey(s), new RegExp(`^${sig.SIGNATURE_VERSION}\\|`));
});

test("ツールを含むキーは手順の同一性を見る", () => {
  const withGmail = sig.buildTaskSignature(ev({ tools: ["gmail"] }));
  const withSlack = sig.buildTaskSignature(ev({ tools: ["slack"] }));
  assert.notEqual(
    sig.signatureKeyWithTools(withGmail),
    sig.signatureKeyWithTools(withSlack)
  );
  // ツールを無視したキーは同じ
  assert.equal(sig.signatureKey(withGmail), sig.signatureKey(withSlack));
});

test("ツールの並び順が違っても同じキーになる", () => {
  const a = sig.buildTaskSignature(ev({ tools: ["gmail", "slack"] }));
  const b = sig.buildTaskSignature(ev({ tools: ["slack", "gmail"] }));
  assert.equal(sig.signatureKeyWithTools(a), sig.signatureKeyWithTools(b));
});
