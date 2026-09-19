import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const read = (file) => fs.readFileSync(file, "utf8");
const execution = "app/lib/company/execution/";
test("Phase 6 Protected Core and invariant tests retain exact main content", () => {
  const expected = {
    "app/lib/company/execution/actionGateway.ts":
      "d1b43aec07bf6129ecb6eaaa1a4b20ffd4e13c3951c7b25d6494e020ca49895d",
    "app/lib/company/execution/approval.ts":
      "82aa45db01701bb50dbc9dde67f78731a20bb06b622aac3bd88b41cf66105022",
    "tests/architecture/phase6-invariants.test.mjs":
      "d553c2d9d185812be4611d5e7a2a7a6f8b9c28888393bdd207670765eede913d",
  };
  for (const [file, hash] of Object.entries(expected))
    assert.equal(
      crypto.createHash("sha256").update(read(file)).digest("hex"),
      hash,
      file,
    );
});
test("no raw executor export, broker, external mutation or agent credential access", () => {
  for (const file of fs
    .readdirSync(execution)
    .filter((f) => f.endsWith(".ts"))) {
    const source = read(path.join(execution, file));
    assert.doesNotMatch(
      source,
      /placeOrder|submitOrder|executeTrade|sellPosition|sendMail\(|createPullRequest|child_process/,
    );
    assert.doesNotMatch(source, /agent\.(?:credentials|secret|token|apiKey)/);
    assert.doesNotMatch(
      file,
      /investmentTradeExecutor|tradeExecutor|brokerExecutor|gmailExecutor|githubExecutor|publishExecutor|calendarExecutor/i,
    );
  }
  assert.doesNotMatch(
    read(execution + "executorRegistry.ts"),
    /export (?:const|function) (?:registry|resolveInternalExecutor)/,
  );
});
test("gateway precedes registry invocation and executor never performs network IO", () => {
  const source = read(execution + "executorRegistry.ts");
  assert.ok(
    source.indexOf("const fresh = reviewActionRequest") <
      source.indexOf("const executor = registry.get"),
  );
  assert.doesNotMatch(source, /fetch\(|saveVaultFile|process\.env|writeFile/);
  assert.match(source, /canExecuteAfterApproval/);
  assert.match(source, /runSecurityReview/);
});
test("run API has bounded execution, same-origin check and uses authenticated API namespace", () => {
  const source = read("app/api/company/missions/[id]/run/route.ts");
  assert.match(source, /runMission/);
  assert.match(source, /ORIGIN_DENIED/);
  assert.match(
    read(execution + "runnerConfig.ts"),
    /maxSteps: 10,\s*maxRetries: 2,\s*maxReplans: 2/,
  );
  assert.match(read(execution + "service.ts"), /assertLocalRunnerStorage\(\)/);
});
test("Mission Skill Runtime is internal-only and default-deny", () => {
  const source = read("app/lib/skills/missionRuntime.ts");
  assert.match(source, /definition\.status !== "implemented"/);
  assert.match(source, /allowedSecretaries\.includes/);
  assert.match(source, /agentSkillIds\.includes/);
  assert.match(source, /UNKNOWN_SKILL/);
  assert.doesNotMatch(source, /fetch\(|process\.env|writeFile|saveVaultFile|captureKnowledge/i);
});
