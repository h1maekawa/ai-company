import type { ExecutionState } from "../execution/store";
import type { ExecutionMission } from "../execution/mission";
import type { CompanyEvent } from "../events";

export type ExecutionEventType =
  | "LEASE_ACQUIRED"
  | "LEASE_FAILED"
  | "LEASE_EXPIRED"
  | "MISSION_RESUMED"
  | "MISSION_RECOVERED"
  | "CYCLE_STARTED"
  | "CYCLE_COMPLETED"
  | "CYCLE_FAILED"
  | "MODEL_RESULT_UNKNOWN"
  | "CANARY_COMPLETED"
  | "CANARY_FAILED";

export type ExecutionEvent = CompanyEvent & {
  type: ExecutionEventType;
  missionId?: string;
  cycleId?: string;
  holderId?: string;
  createdAt: string;
};

export type MissionLease = {
  missionId: string;
  holderId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string;
};

export type LeaseGuard = Pick<MissionLease, "missionId" | "holderId" | "fencingToken">;

export type ExecutionSnapshot = {
  schemaVersion: string;
  version: number;
  state: ExecutionState;
  updatedAt: string;
};

export type StoreSaveOptions = {
  expectedVersion: number;
  lease?: LeaseGuard;
};

export interface ExecutionStore {
  kind: "local" | "durable";
  load(): Promise<ExecutionSnapshot>;
  save(state: ExecutionState, options: StoreSaveOptions): Promise<ExecutionSnapshot>;
  getMission(id: string): Promise<ExecutionMission | null>;
  saveMission(mission: ExecutionMission, expectedVersion: number, lease?: LeaseGuard): Promise<void>;
  getExecution(id: string): Promise<ExecutionState | null>;
  appendEvent(event: ExecutionEvent): Promise<void>;
  listEvents(limit?: number): Promise<ExecutionEvent[]>;
  listPendingMissions(): Promise<ExecutionMission[]>;
  acquireLease(missionId: string, holderId: string, ttlMs: number, now?: Date): Promise<MissionLease | null>;
  heartbeatLease(lease: LeaseGuard, ttlMs: number, now?: Date): Promise<MissionLease>;
  releaseLease(lease: LeaseGuard): Promise<void>;
  getLease(missionId: string): Promise<MissionLease | null>;
  claimIdempotency(scope: string, key: string, ttlSeconds?: number): Promise<boolean>;
  completeIdempotency(scope: string, key: string, result: unknown, ttlSeconds?: number): Promise<void>;
  getIdempotencyResult<T>(scope: string, key: string): Promise<T | null>;
}

export class ExecutionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("CONFLICT");
  }
}

export class FencingTokenError extends Error {
  constructor() {
    super("FENCING_TOKEN_MISMATCH");
  }
}

export class StoreUnavailableError extends Error {
  constructor(message = "DURABLE_EXECUTION_STORE_UNAVAILABLE") {
    super(message);
  }
}
