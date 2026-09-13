import type { RunnerLimits, RunnerState, MissionRun } from "./runnerTypes";
export const RUNNER_DEFAULTS: Readonly<RunnerLimits> = Object.freeze({
  maxSteps: 10,
  maxRetries: 2,
  maxReplans: 2,
  maxExecutionTime: 30000,
});
export function runnerLimits(input: Partial<RunnerLimits> = {}): RunnerLimits {
  const limits = { ...RUNNER_DEFAULTS, ...input };
  for (const key of Object.keys(RUNNER_DEFAULTS) as (keyof RunnerLimits)[]) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < (key === "maxRetries" || key === "maxReplans" ? 0 : 1) ||
      limits[key] > RUNNER_DEFAULTS[key]
    )
      throw new Error(`Invalid execution limit: ${key}`);
  }
  return limits;
}
export const emptyRunnerState = (): RunnerState => ({
  runs: {},
  executions: [],
  artifacts: [],
  learning: [],
});
export const emptyMissionRun = (): MissionRun => ({
  steps: 0,
  retries: 0,
  replans: 0,
  elapsedMs: 0,
  rejectedProposals: [],
  history: [],
});
