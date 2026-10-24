import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const out = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const delegation = await import(path.join(out, "execution", "businessDelegation.js"));
const { setExecutionStoreForTests } = await import(path.join(out, "execution", "store.js"));
const { runProductionMission } = await import(path.join(out, "runtime", "productionRunner.js"));
const NOW = new Date("2026-10-24T00:00:00.000Z");

class MemoryExecutionStore {
  kind = "local";
  state = { missions: [], actionRequests: [], approvals: [], plans: [], contentDraftCandidates: [], skillCandidates: [], skillEngineeringSpecifications: [], skillEngineeringHandoffs: [], companyImprovementSpecifications: [], companyImprovementHandoffs: [] };
  version = 0;
  idempotency = new Map();
  events = [];
  failSave = false;
  async load() { return { schemaVersion: "test", version: this.version, state: structuredClone(this.state), updatedAt: NOW.toISOString() }; }
  async save(state, options) {
    if (this.failSave) throw new Error("SIMULATED_STORE_FAILURE");
    if (options.expectedVersion !== this.version) throw new Error("CONFLICT");
    this.state = structuredClone(state);
    this.version += 1;
    return this.load();
  }
  async getMission(id) { return this.state.missions.find((mission) => mission.id === id) ?? null; }
  async saveMission(mission, expectedVersion) { const snap = await this.load(); snap.state.missions = [...snap.state.missions.filter((item) => item.id !== mission.id), mission]; await this.save(snap.state, { expectedVersion }); }
  async getExecution(id) { return this.state.missions.some((mission) => mission.id === id) ? structuredClone(this.state) : null; }
  async appendEvent(event) { this.events.push(event); }
  async listEvents(limit = 100) { return this.events.slice(-limit); }
  async listPendingMissions() { return this.state.missions.filter((mission) => ["PLANNED", "ACTIVE", "EXECUTING", "WAITING_APPROVAL"].includes(mission.status)); }
  async acquireLease(missionId, holderId, ttlMs) { if (this.lease) return null; this.lease = { missionId, holderId, fencingToken: 1, acquiredAt: NOW.toISOString(), heartbeatAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + ttlMs).toISOString() }; return this.lease; }
  async heartbeatLease(lease) { return lease; }
  async releaseLease() { this.lease = null; }
  async getLease() { return this.lease ?? null; }
  async claimIdempotency(scope, key) { const id = `${scope}:${key}`; if (this.idempotency.has(id)) return false; this.idempotency.set(id, { processing: true }); return true; }
  async completeIdempotency(scope, key, result) { this.idempotency.set(`${scope}:${key}`, structuredClone(result)); }
  async getIdempotencyResult(scope, key) { return this.idempotency.get(`${scope}:${key}`) ?? null; }
}

const input = (overrides = {}) => ({
  businessId: "SNS",
  workerAgentId: "creator-content",
  title: "Draft research brief",
  description: "Prepare an internal draft brief for review.",
  budgetYen: 0,
  executionCount: 1,
  deadline: "2026-10-24T12:00:00.000Z",
  idempotencyKey: "request-001",
  now: NOW,
  ...overrides,
});

test("creates a Worker-assigned Mission with registry-resolved Manager and immutable business scope", async () => {
  const store = new MemoryExecutionStore();
  setExecutionStoreForTests(store);
  try {
    const result = await delegation.createBusinessDelegationMission({ ...input(), managerAgentId: "executive-assistant", businessIdFromBody: "INVEST" });
    assert.equal(result.ok, true);
    assert.equal(result.data.mission.businessId, "SNS");
    assert.equal(result.data.mission.delegatedByAgentId, "personal-note");
    assert.equal(result.data.mission.assignedAgentId, "creator-content");
    assert.equal(result.data.mission.routingContext.requiredAgentId, "creator-content");
    assert.equal(result.data.mission.delegationRunLimit, 1);
  } finally { setExecutionStoreForTests(); }
});

test("prevents duplicate Missions for an idempotent Manager request", async () => {
  const store = new MemoryExecutionStore();
  setExecutionStoreForTests(store);
  try {
    const first = await delegation.createBusinessDelegationMission(input());
    const replay = await delegation.createBusinessDelegationMission(input());
    assert.equal(first.ok, true);
    assert.equal(replay.ok, true);
    assert.equal(replay.data.replayed, true);
    assert.equal(store.state.missions.length, 1);
    assert.equal(replay.data.mission.id, first.data.mission.id);
  } finally { setExecutionStoreForTests(); }
});

test("rejects a Worker outside the Business registry, including cross-business assignment", async () => {
  const store = new MemoryExecutionStore();
  setExecutionStoreForTests(store);
  try {
    const investmentCrossing = await delegation.createBusinessDelegationMission(input({ businessId: "INVEST", workerAgentId: "creator-content" }));
    const unknown = await delegation.createBusinessDelegationMission(input({ workerAgentId: "executive-assistant", idempotencyKey: "request-002" }));
    assert.equal(investmentCrossing.ok, false);
    assert.equal(investmentCrossing.error, "WORKER_NOT_AUTHORIZED");
    assert.equal(unknown.error, "WORKER_NOT_AUTHORIZED");
    assert.equal(store.state.missions.length, 0);
  } finally { setExecutionStoreForTests(); }
});

test("separates task budget, rolling budget, Mission rate, per-task runs, and deadline", async () => {
  const recent = (overrides = {}) => ({
    id: `old-${Math.random()}`,
    businessId: "SNS",
    createdAt: "2026-10-23T23:30:00.000Z",
    delegationBudgetYen: 0,
    ...overrides,
  });
  for (const [request, seeded, expected] of [
    [input({ budgetYen: 1 }), [], "BUDGET_LIMIT_EXCEEDED"],
    [input(), [recent({ delegationBudgetYen: 1 })], "CUMULATIVE_BUDGET_LIMIT_EXCEEDED"],
    [input(), Array.from({ length: 6 }, () => recent()), "MISSION_RATE_LIMIT_EXCEEDED"],
    [input({ executionCount: 4 }), [], "EXECUTION_LIMIT_EXCEEDED"],
    [input({ deadline: "2026-10-25T00:00:01.000Z" }), [], "DEADLINE_OUT_OF_BOUNDS"],
  ]) {
    const store = new MemoryExecutionStore();
    store.state.missions = seeded;
    setExecutionStoreForTests(store);
    const result = await delegation.createBusinessDelegationMission(request);
    assert.equal(result.ok, false, expected);
    assert.equal(result.error, expected);
    assert.equal(store.state.missions.length, seeded.length);
  }
  setExecutionStoreForTests();
});

test("fails closed when Execution Store save fails", async () => {
  const store = new MemoryExecutionStore();
  store.failSave = true;
  setExecutionStoreForTests(store);
  try {
    const result = await delegation.createBusinessDelegationMission(input());
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, "EXECUTION_STORE_UNAVAILABLE");
    assert.equal(store.state.missions.length, 0);
  } finally { setExecutionStoreForTests(); }
});

test("a Business Mission cannot exceed its stored run limit even with a new idempotency key", async () => {
  const store = new MemoryExecutionStore();
  store.state.missions = [{
    id: "business-mission-1", businessId: "SNS", delegationRunLimit: 1, delegationRunCount: 1,
    status: "ACTIVE", assignedAgentId: "creator-content", actionRequestIds: [], history: [], version: 0,
  }];
  setExecutionStoreForTests(store);
  try {
    await assert.rejects(() => runProductionMission({ missionId: "business-mission-1", idempotencyKey: "retry-with-new-key", store }), /BUSINESS_MISSION_RUN_LIMIT_REACHED/);
    assert.equal(store.state.missions[0].delegationRunCount, 1);
  } finally { setExecutionStoreForTests(); }
});
