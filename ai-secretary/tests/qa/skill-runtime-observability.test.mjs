import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = process.env.QA_DIST + "/out";
const observable = require(path.join(root, "app/lib/company/evolution/skillObservability.js"));
const implementations = require(path.join(root, "app/lib/skills/implementationRegistry.js"));
const registry = require(path.join(root, "app/lib/skills/registry.js"));
const executor = require(path.join(root, "app/lib/skills/executor.js"));
const mission = require(path.join(root, "app/lib/skills/missionRuntime.js"));

test("implemented SkillとImplementation Registryは1対1", () => {
  const implemented = registry.listSkills().filter((skill) => skill.status === "implemented").map((skill) => skill.id).sort();
  assert.deepEqual(Object.keys(implementations.SKILL_IMPLEMENTATIONS).sort(), implemented);
  for (const implementation of Object.values(implementations.SKILL_IMPLEMENTATIONS)) assert.ok(registry.getSkillById(implementation.skillId));
});

test("directとmissionは同じ実装を使い既存Skillが実行可能", async () => {
  const direct = await executor.executeSkill({ skillId: "personal-today-show", secretaryId: "personal-morning", input: {} });
  const viaMission = await mission.executeMissionSkill({ skillId: "personal-today-show", agentId: "personal-morning", agentSkillIds: ["personal-today-show"], objective: "today", context: "" });
  assert.equal(direct.ok, true); assert.equal(viaMission.ok, true); assert.equal(direct.markdown, viaMission.markdown);
  const cases = [
    ["personal-capture", "executive-assistant", { content: "fact" }],
    ["personal-todo-add", "personal-morning", { task: "task" }],
    ["personal-today-show", "personal-morning", {}],
    ["note-draft-format", "personal-note", { title: "title", theme: "theme" }],
    ["fund-log-format", "personal-fund", { reason: "analysis" }],
  ];
  for (const [skillId, secretaryId, input] of cases) assert.equal((await executor.executeSkill({ skillId, secretaryId, input })).ok, true, String(skillId));
});

test("authorization・unknown・plannedは安全に失敗する", async () => {
  assert.equal((await executor.executeSkill({ skillId: "personal-today-show", secretaryId: "personal-fund", input: {} })).ok, false);
  assert.equal((await executor.executeSkill({ skillId: "unknown", secretaryId: "personal-morning", input: {} })).ok, false);
  assert.equal((await executor.executeSkill({ skillId: "content-kpi-analysis", secretaryId: "creator-kpi", input: {} })).ok, false);
});

const event = (overrides = {}) => observable.skillExecutionEvent({ skillId: "note-draft-format", agentId: "personal-note", source: "mission", result: { skillId: "note-draft-format", secretaryId: "personal-note", ok: true, warnings: [] }, startedAt: new Date("2026-09-22T00:00:00Z"), completedAt: new Date("2026-09-22T00:00:00.010Z"), missionId: "mission-1", stepId: "step-1", knowledgeRefs: ["knowledge-1"], ...overrides });

test("Execution Eventはoperational metadataのみでMission/Step/Agentを保持", () => {
  const value = event(); assert.equal(value.durationMs, 10); assert.equal(value.missionId, "mission-1"); assert.equal(value.stepId, "step-1"); assert.equal(value.agentId, "personal-note");
  assert.doesNotMatch(JSON.stringify(value), /raw prompt|credential|secret-value|markdown/i);
});

test("Usageはattempt数とdistinct Missionを分けUNKNOWNと0を区別", () => {
  const events = [event(), event(), event({ missionId: "mission-2", completedAt: new Date("2026-09-23T00:00:00Z") })];
  const metrics = observable.skillEffectiveness("note-draft-format", events, []);
  assert.equal(metrics.executionCount, 3); assert.equal(metrics.distinctMissionCount, 2); assert.equal(metrics.successRate, 1); assert.equal(metrics.lastUsedAt, "2026-09-23T00:00:00.000Z"); assert.equal(metrics.causalConclusion, null);
  assert.equal(observable.skillEffectiveness("unused", [], []).executionCount, 0);
  assert.equal(observable.skillEffectiveness("unknown", null, []).availability, "UNKNOWN");
});

test("単発失敗はnoiseにせず反復失敗だけ非実行Candidateにする", () => {
  const failed = Array.from({ length: 3 }, (_, index) => event({ missionId: `m-${index}`, result: { skillId: "note-draft-format", secretaryId: "personal-note", ok: false, error: "INVALID_SKILL_OUTPUT" } }));
  assert.equal(observable.discoverSkillImprovementCandidates(["note-draft-format"], failed, []).length, 0);
  const candidates = observable.discoverSkillImprovementCandidates(["note-draft-format"], [...failed, event(), event()], []);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].reasonType, "REPEATED_ERROR"); assert.equal(candidates[0].executable, false); assert.equal(candidates[0].registryMutationAllowed, false); assert.equal(candidates[0].engineeringHandoffAllowed, false);
});

test("bounded historyは上限を超えない", () => {
  let events = []; for (let index = 0; index < 12; index++) events = observable.appendSkillExecution(events, event(), 10); assert.equal(events.length, 10);
});
