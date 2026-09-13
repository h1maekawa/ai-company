import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  agent,
  worker,
  submit,
  runner,
  actions,
  registry,
  learning,
  performance,
  lifecycle,
  skillRuntime,
} from "./phase7-fixture.mjs";
test("agent completes required steps, review, report and records success", async () => {
  const s = fixture();
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.missions[0].status, "COMPLETED");
  assert.ok(s.runtime.learning.some((e) => e.type === "MISSION_SUCCEEDED"));
  assert.equal(s.runtime.artifacts.length, 1);
});
test("missing agent and denied permissions are blocked without automatic retry", async () => {
  for (const a of [null, { ...agent, granted: [] }]) {
    const s = fixture();
    await runner.runAgent(s, "m", a, worker);
    assert.equal(s.missions[0].status, "BLOCKED");
    const n = s.runtime.runs.m.steps;
    await runner.runAgent(s, "m", a, worker);
    assert.equal(s.runtime.runs.m.steps, n);
  }
});
test("no required review cannot complete", async () => {
  const s = fixture([{ type: "generate" }]);
  await runner.runAgent(s, "m", agent, worker);
  assert.notEqual(s.missions[0].status, "COMPLETED");
});

test("checkpoints publish executing and reviewing state before completion", async () => {
  const state = fixture();
  const observed = [];
  await runner.runAgent(state, "m", agent, worker, {}, async (snapshot) => {
    observed.push(snapshot.missions[0].status);
  });
  assert.ok(observed.includes("EXECUTING"));
  assert.ok(observed.includes("REVIEWING"));
});

test("quality WARN is recorded but does not prevent safe Mission completion", async () => {
  const state = fixture();
  const unrelated = async () => "# 別テーマ\n\n十分な長さの安全な内部レポートです。";
  await runner.runAgent(state, "m", agent, unrelated);
  assert.equal(state.runtime.runs.m.review.verdict, "WARN");
  assert.equal(state.runtime.runs.m.review.canProceed, true);
  assert.equal(state.missions[0].status, "COMPLETED");
  assert.equal(state.runtime.runs.m.reviewHistory.length, 1);
});

test("implemented Skill executes inside Mission context and completes", async () => {
  const state = fixture([
    { type: "research", requiredSkillId: "note-draft-format" },
    { type: "generate" },
    { type: "review" },
    { type: "action", actionType: "INTERNAL_REPORT_CREATE" },
  ]);
  const noteAgent = { ...agent, id: "personal-note", skillIds: ["note-draft-format"] };
  state.missions[0].assignedAgentId = noteAgent.id;
  state.plans[0].agentId = noteAgent.id;
  await runner.runAgent(state, "m", noteAgent, worker);
  assert.equal(state.missions[0].status, "COMPLETED");
  assert.match(state.runtime.runs.m.history[0].output, /note下書き/);
  assert.equal(state.runtime.artifacts.length, 1);
});

test("Skill Runtime default-denies planned, unknown and unauthorized Skills", async () => {
  const base = { agentId: "personal-note", agentSkillIds: [], objective: "記事", context: "材料" };
  const planned = await skillRuntime.executeMissionSkill({ ...base, agentSkillIds: ["personal-idea-create"], skillId: "personal-idea-create" });
  const unknown = await skillRuntime.executeMissionSkill({ ...base, skillId: "unknown-skill" });
  const unauthorized = await skillRuntime.executeMissionSkill({ ...base, skillId: "note-draft-format" });
  assert.equal(planned.error, "SKILL_NOT_IMPLEMENTED");
  assert.equal(unknown.error, "UNKNOWN_SKILL");
  assert.equal(unauthorized.error, "SKILL_NOT_AUTHORIZED");
});

test("security FAIL still blocks Mission completion", async () => {
  const state = fixture();
  await runner.runAgent(state, "m", agent, async () => "api_key = sk_live_abcd1234efgh");
  assert.equal(state.missions[0].status, "BLOCKED");
  assert.equal(state.runtime.artifacts.length, 0);
});
