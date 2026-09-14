export const RUNTIME_DEFAULTS = Object.freeze({
  missionLeaseTtlMs: 30_000,
  heartbeatIntervalMs: 10_000,
  globalCycleLeaseTtlMs: 55_000,
  maxMissionsPerCycle: 1,
  maxModelCallsPerCycle: 6,
  maxRuntimeMs: 50_000,
  idempotencyTtlSeconds: 7 * 24 * 60 * 60,
  opportunityRefreshIntervalMs: 24 * 60 * 60 * 1000,
  dailyAIBudgetUsd: 0,
});

export function runtimeLimits(input: Partial<typeof RUNTIME_DEFAULTS> = {}) {
  const limits = { ...RUNTIME_DEFAULTS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    const zeroAllowed = key === "dailyAIBudgetUsd";
    if (!Number.isSafeInteger(value) || value < 0 || (!zeroAllowed && value === 0) || value > RUNTIME_DEFAULTS[key as keyof typeof RUNTIME_DEFAULTS]) {
      throw new Error(`INVALID_RUNTIME_LIMIT:${key}`);
    }
  }
  return limits;
}
