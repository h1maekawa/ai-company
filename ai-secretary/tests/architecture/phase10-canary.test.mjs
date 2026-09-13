import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const model = read("app/lib/company/runtime/modelCanary.ts");
const store = read("app/lib/company/runtime/canaryStore.ts");
const cron = read("app/api/cron/personal-company-runtime/route.ts");
const cycle = read("app/lib/company/runtime/autonomousCycle.ts");
const registry = read("app/lib/company/execution/executorRegistry.ts");

test("Phase 10-A canary validates a real response without autonomous runtime", () => {
  assert.match(cron, /runScheduledRealModelCanary/);
  assert.match(cron, /AUTONOMOUS_RUNTIME_DISABLED/);
  assert.ok(cron.indexOf("runScheduledRealModelCanary") < cron.lastIndexOf("AUTONOMOUS_RUNTIME_DISABLED"));
});

test("canary validates schema, review, timeout, persistence, cost and security", () => {
  for (const token of ["CANARY_OK", "schemaValidated", "reviewVerdict", "AbortController", "redisPersisted", "cost", "security", "externalActionCount"])
    assert.match(model, new RegExp(token));
  assert.match(store, /:canary:execution:v1:results/);
});

test("canary never mutates production mission, revenue or opportunity state", () => {
  assert.doesNotMatch(model, /getExecutionStore|saveRevenue|saveOpportunities|startMission|runProductionMission|actionRequest/);
  assert.doesNotMatch(cycle, /runRealModelCanary|model-canary/);
});

test("external executors remain limited and investment trade has no executor", () => {
  assert.doesNotMatch(registry, /GMAIL_DRAFT|GMAIL_SEND|INVESTMENT_TRADE|CALENDAR_WRITE|PUBLISH/);
});

/*
 * ここから下は静的検査ではなく、実際に Review を走らせる回帰テスト。
 *
 * Production Canary の初回実行が FAIL した原因は、modelCanary.ts が
 * expectedOutputs に "short acknowledgement" という、モデルが返すはずのない
 * 文字列を渡していたこと。Quality Review は literal 一致で見るため、
 * モデルが何を返しても WARN になり Canary は構造的に PASS できなかった。
 * 上の token 検査は全て通っていたので素通りした。
 */
const dist = process.env.ARCHITECTURE_DIST;
const { runReviewPipeline } = await import(path.join(dist, "reviewer.js"));
const contract = await import(path.join(dist, "canaryContract.js"));

const reviewAsCanary = (output) =>
  runReviewPipeline({
    quality: {
      objective: contract.CANARY_OBJECTIVE,
      output,
      expectedOutputs: contract.CANARY_EXPECTED_OUTPUTS,
    },
    security: { output, externalContent: contract.CANARY_EXTERNAL_CONTEXT },
  });

test("【重要】Canaryの正常な応答がReviewをPASSできる（構造的に失敗しない）", () => {
  const realistic = [
    `{"ack":"${contract.CANARY_ACK}","message":"Runtime canary check successful."}`,
    `{"ack": "${contract.CANARY_ACK}", "message": "All systems nominal."}`,
    `{"ack":"${contract.CANARY_ACK}","message":"Canary acknowledged, runtime healthy."}`,
    "```json\n" + `{"ack":"${contract.CANARY_ACK}","message":"ok"}` + "\n```",
  ];
  for (const output of realistic) {
    const result = reviewAsCanary(output);
    const bad = [...result.quality.findings, ...result.security.findings]
      .filter((f) => f.verdict !== "PASS")
      .map((f) => `${f.id}: ${f.message}`);
    assert.equal(result.verdict, "PASS", `${output}\n  -> ${bad.join(" / ")}`);
  }
});

test("【重要】Canaryのexpectedは実際の出力に現れる語である", () => {
  // expectedOutputs は literal 一致で判定されるので、
  // モデルへ要求している ack をそのまま置いていなければ必ずWARNになる。
  assert.ok(contract.CANARY_EXPECTED_OUTPUTS.includes(contract.CANARY_ACK));
  // alignment は case-sensitive な substring 判定。objective に ack を含めておく。
  assert.ok(contract.CANARY_OBJECTIVE.includes(contract.CANARY_ACK));
  // modelCanary は契約を import して使う。Review条件を直接書かない。
  assert.match(model, /canaryContract/);
  assert.doesNotMatch(model, /expectedOutputs:\s*\[\s*"/);
});

test("【重要】Reviewが素通りしていない（危険な出力はPASSしない）", () => {
  // 上のテストが「常にPASS」で通ってしまわないことの確認。
  const leaked = `{"ack":"${contract.CANARY_ACK}","message":"api_key: sk-abcdef0123456789"}`;
  assert.equal(reviewAsCanary(leaked).verdict, "FAIL");
  const core = `{"ack":"${contract.CANARY_ACK}","message":"updated action-gateway"}`;
  assert.equal(reviewAsCanary(core).verdict, "FAIL");
});
