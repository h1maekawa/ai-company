import { readLocalExecution, writeLocalExecution } from "../execution/localStore";
import type { ExecutionMission } from "../execution/mission";
import type { ExecutionState } from "../execution/store";
import { assertAppendOnly, executionMarkdown, normalizeExecutionState, parseExecutionMarkdown } from "./stateCodec";
import type { ExecutionEvent, ExecutionSnapshot, ExecutionStore, LeaseGuard, MissionLease } from "./runtimeTypes";
import { ExecutionConflictError, FencingTokenError } from "./runtimeTypes";
import { RUNTIME_SCHEMA_VERSION } from "./deploymentMetadata";

export class LocalExecutionStore implements ExecutionStore {
  readonly kind = "local" as const;
  private version = 0;
  private leases = new Map<string, MissionLease>();
  private fencing = new Map<string, number>();
  private events: ExecutionEvent[] = [];
  private idempotency = new Map<string, unknown>();

  async load(): Promise<ExecutionSnapshot> {
    const state = parseExecutionMarkdown(await readLocalExecution());
    this.version = Math.max(this.version, ...state.missions.map((mission) => mission.version ?? 0), 0);
    return { schemaVersion: RUNTIME_SCHEMA_VERSION, version: this.version, state, updatedAt: new Date().toISOString() };
  }

  async save(state: ExecutionState, options: { expectedVersion: number; lease?: LeaseGuard }) {
    const previous = await this.load();
    if (options.expectedVersion !== previous.version) throw new ExecutionConflictError(previous.version);
    if (options.lease) this.assertLease(options.lease);
    assertAppendOnly(previous.state, state);
    const version = previous.version + 1;
    const normalized = normalizeExecutionState(state);
    normalized.missions = normalized.missions.map((mission) => ({
      ...mission,
      version: mission.version === previous.state.missions.find((item) => item.id === mission.id)?.version
        ? mission.version
        : version,
    }));
    await writeLocalExecution(executionMarkdown(normalized), normalized.runtime?.learning ?? []);
    this.version = version;
    return { schemaVersion: RUNTIME_SCHEMA_VERSION, version, state: normalized, updatedAt: new Date().toISOString() };
  }

  async getMission(id: string) { return (await this.load()).state.missions.find((mission) => mission.id === id) ?? null; }
  async saveMission(mission: ExecutionMission, expectedVersion: number, lease?: LeaseGuard) {
    const snapshot = await this.load();
    const exists = snapshot.state.missions.some((item) => item.id === mission.id);
    snapshot.state.missions = exists
      ? snapshot.state.missions.map((item) => (item.id === mission.id ? mission : item))
      : [...snapshot.state.missions, mission];
    await this.save(snapshot.state, { expectedVersion, lease });
  }
  async getExecution(id: string): Promise<ExecutionState | null> {
    const snapshot = await this.load();
    return snapshot.state.missions.some((mission) => mission.id === id) ? snapshot.state : null;
  }
  async appendEvent(event: ExecutionEvent) {
    if (!this.events.some((item) => item.id === event.id)) this.events.push(structuredClone(event));
  }
  async listEvents(limit = 100) { return this.events.slice(-limit).map((event) => structuredClone(event)); }
  async listPendingMissions() {
    return (await this.load()).state.missions.filter((mission) =>
      ["PLANNED", "open", "ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(mission.status),
    );
  }
  async acquireLease(missionId: string, holderId: string, ttlMs: number, now = new Date()) {
    const existing = await this.getLease(missionId);
    if (existing) return null;
    const fencingToken = (this.fencing.get(missionId) ?? 0) + 1;
    this.fencing.set(missionId, fencingToken);
    const lease = { missionId, holderId, fencingToken, acquiredAt: now.toISOString(), heartbeatAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
    this.leases.set(missionId, lease);
    return { ...lease };
  }
  async heartbeatLease(guard: LeaseGuard, ttlMs: number, now = new Date()) {
    this.assertLease(guard, now);
    const lease = this.leases.get(guard.missionId)!;
    const updated = { ...lease, heartbeatAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
    this.leases.set(guard.missionId, updated);
    return { ...updated };
  }
  async releaseLease(guard: LeaseGuard) { this.assertLease(guard); this.leases.delete(guard.missionId); }
  async getLease(missionId: string) {
    const lease = this.leases.get(missionId);
    if (!lease) return null;
    if (Date.parse(lease.expiresAt) <= Date.now()) { this.leases.delete(missionId); return null; }
    return { ...lease };
  }
  async claimIdempotency(scope: string, key: string) {
    const id = `${scope}:${key}`;
    if (this.idempotency.has(id)) return false;
    this.idempotency.set(id, { status: "PROCESSING" });
    return true;
  }
  async completeIdempotency(scope: string, key: string, result: unknown) { this.idempotency.set(`${scope}:${key}`, result); }
  async getIdempotencyResult<T>(scope: string, key: string) { return (this.idempotency.get(`${scope}:${key}`) as T | undefined) ?? null; }

  private assertLease(guard: LeaseGuard, now = new Date()) {
    const lease = this.leases.get(guard.missionId);
    if (!lease || lease.holderId !== guard.holderId || lease.fencingToken !== guard.fencingToken || Date.parse(lease.expiresAt) <= now.getTime()) {
      throw new FencingTokenError();
    }
  }
}
