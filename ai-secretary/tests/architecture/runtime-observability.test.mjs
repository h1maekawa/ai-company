/**
 * Execution Store version の観測口の契約テスト
 *
 * 背景（2026-09-15）:
 *   Phase 10-B.1 の Production検証中、「Cycleの前後でExecution Storeが進んだか」を
 *   確認したかったが、public health にも認証付きAPIにもversionが出ておらず観測できなかった。
 *   観測口を足すにあたり、public health 側へ漏らさないことを契約として固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const observability = read("app/api/company/runtime/observability/route.ts");
/** 「返していない」の検査は、説明コメントを拾わないようコード部分だけで行う */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const observabilityCode = stripComments(observability);
const health = read("app/api/company/runtime/health/route.ts");
const middleware = read("middleware.ts");
const admin = read("app/admin/page.tsx");

test("internal observability が Execution Store の論理versionを返す", () => {
  assert.match(observability, /executionStoreVersion/);
  assert.match(observability, /runtimeSchemaVersion/);
  assert.match(observability, /snapshot\.version/);
  assert.match(observability, /snapshot\.schemaVersion/);
});

test("観測口はsnapshotを読むだけで、storeを進めない", () => {
  // 書き込み経路を一切持たないこと
  assert.doesNotMatch(observabilityCode, /\.save\(|saveExecutionState|appendEvent|acquireLease|saveMission/);
  assert.match(observability, /getExecutionStore\(\)\.load\(\)/);
});

test("観測口は最終保存時刻を騙らない", () => {
  // DurableExecutionStore.load() は updatedAt に毎回「現在時刻」を入れる。
  // これを lastStoreWriteAt などとして出すと、保存していないのに保存したように見える。
  assert.doesNotMatch(observabilityCode, /lastStoreWriteAt|lastSavedAt|updatedAt/);
  assert.match(observability, /observedAt/);
});

test("【重要】public health に executionStoreVersion を出さない", () => {
  // health は middleware で認証除外されているため、載せると外部へ出る
  assert.match(middleware, /\/api\/company\/runtime\/health/);
  assert.doesNotMatch(health, /executionStoreVersion/);
});

test("【重要】観測口を middleware の認証除外に追加していない", () => {
  assert.doesNotMatch(middleware, /observability/);
  // 機械用の素通しルートにも入れない（CRON_SECRET等の流用をしない）
  assert.doesNotMatch(observabilityCode, /CRON_SECRET|verifyCronSecret|verifyRunnerToken/);
});

test("観測口が接続情報や秘密を返さない", () => {
  assert.doesNotMatch(observabilityCode, /TOKEN|SECRET|PASSWORD|UPSTASH|redisNamespace|process\.env/);
  // snapshot.state をそのまま返すとMission本文やApproval本文が出る
  assert.doesNotMatch(observabilityCode, /snapshot\.state/);
});

test("Adminが取得中と取得失敗を区別する", () => {
  // 両方を同じ値で表すと、Store障害時に「取得中…」のまま止まって見える
  for (const state of ['"loading"', '"connected"', '"unavailable"']) {
    assert.ok(admin.includes(state), `Admin が ${state} の状態を持っていません`);
  }
  assert.match(admin, /取得中/);
  assert.match(admin, /接続できません/);
});

test("Admin だけに表示し、日常画面には出さない", () => {
  assert.match(admin, /Runtime Observability/);
  assert.match(admin, /api\/company\/runtime\/observability/);
  for (const page of ["app/page.tsx", "components/company/office/CompanyOfficeOverview.tsx"]) {
    assert.doesNotMatch(read(page), /executionStoreVersion/, `${page} に観測用の値を出さない`);
  }
});
