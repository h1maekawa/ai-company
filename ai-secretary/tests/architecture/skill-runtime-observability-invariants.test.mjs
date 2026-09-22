import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

test("executeSkill and executeMissionSkill share one Implementation Registry", () => {
  const direct = read("app/lib/skills/executor.ts"); const mission = read("app/lib/skills/missionRuntime.ts");
  assert.match(direct, /getSkillImplementation/); assert.match(mission, /getSkillImplementation/);
  assert.doesNotMatch(direct + mission, /const HANDLERS/);
});

test("telemetry is bounded metadata without raw input or output", () => {
  const source = read("app/lib/company/evolution/skillObservability.ts");
  assert.match(source, /slice\(-limit\)/); assert.match(source, /limit = 1000/);
  assert.doesNotMatch(source, /rawPrompt|rawInput|markdown:|credential|secret:/i);
});

test("improvement review cannot mutate Registry, delete Skill or start Engineering", () => {
  const route = read("app/api/company/skill-improvements/[id]/decision/route.ts");
  assert.match(route, /codeChanged: false, registryChanged: false, engineeringStarted: false/);
  assert.doesNotMatch(route, /SKILL_REGISTRY|createEngineeringIssue|addAiReadyLabel|deleteSkill/);
});

test("Skill Effectiveness is factual and makes no causal score", () => {
  const source = read("app/lib/company/evolution/skillObservability.ts");
  assert.match(source, /causalConclusion: null/); assert.doesNotMatch(source, /overallScore|skillScore/);
});

test("existing financial, creator and engineering boundaries remain", () => {
  assert.match(read("app/lib/company/execution/actionTypes.ts"), /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(read("app/lib/fund/engine.ts"), /executionAuthority: "HUMAN_ONLY"/);
  assert.match(read("app/lib/fund/engine.ts"), /aiExecutionAllowed: false/);
  assert.doesNotMatch(read("app/lib/company/evolution/skillObservability.ts"), /publish|mergePullRequest|productionDeploy/);
});
