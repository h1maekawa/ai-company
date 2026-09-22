import path from "node:path";
import { credentialNameForAgent, type AgentCredentialName } from "./credentials";

export type EngineeringAgentAuthMode = "api_key" | "chatgpt";

export type EngineeringConfig = {
  enabled: boolean;
  dryRun: boolean;
  machineId?: string;
  repository: string;
  repoDir: string;
  workspaceDir: string;
  stateDir: string;
  worktreesDir: string;
  artifactsDir: string;
  logsDir: string;
  agentCommand: string;
  agentArgs: string[];
  agentAuthMode: EngineeringAgentAuthMode;
  codexHome: string;
  agentCredentialName: AgentCredentialName;
  keychainService: string;
  keychainAccount: string;
  pollIntervalMs: number;
  leaseMs: number;
  maxTasksPerDay: number;
  maxAgentRunsPerTask: number;
  maxFixAttempts: number;
  maxCiFixAttempts: number;
  maxChangedFiles: number;
  maxDiffLines: number;
  maxConcurrentTasks: 1;
  npmCacheDir: string;
  /** CI check names (substring match) that must all pass before READY_FOR_HUMAN_REVIEW.
   * Non-listed checks (e.g. Cloudflare Pages) are ignored for the pass/fail decision.
   * Configure via ENGINEERING_REQUIRED_CI_CHECKS_JSON env var. */
  requiredCiChecks: string[];
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function jsonStringArray(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("must be a JSON array of strings");
  }
  return parsed;
}

function jsonArgs(value: string | undefined): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("ENGINEERING_AGENT_ARGS_JSON must be a JSON array of strings");
  }
  return parsed;
}

export function loadEngineeringConfig(env: NodeJS.ProcessEnv = process.env): EngineeringConfig {
  const workspaceDir = path.resolve(env.ENGINEERING_WORKSPACE_DIR || path.join(process.cwd(), ".engineering-worker"));
  const agentCommand = env.ENGINEERING_AGENT_COMMAND || "codex";
  const rawAuthMode = env.ENGINEERING_AGENT_AUTH_MODE || "api_key";
  if (rawAuthMode !== "api_key" && rawAuthMode !== "chatgpt") {
    throw new Error("ENGINEERING_AGENT_AUTH_MODE must be api_key or chatgpt");
  }
  const agentAuthMode: EngineeringAgentAuthMode = rawAuthMode;
  const executable = agentCommand.split("/").pop()?.toLowerCase();
  if (agentAuthMode === "chatgpt" && executable !== "codex") {
    throw new Error("ENGINEERING_AGENT_AUTH_MODE=chatgpt requires ENGINEERING_AGENT_COMMAND=codex");
  }
  const agentCredentialName = credentialNameForAgent(agentCommand, env.ENGINEERING_AGENT_CREDENTIAL_NAME);
  return {
    enabled: env.ENGINEERING_WORKER_ENABLED !== "false",
    dryRun: env.ENGINEERING_DRY_RUN === "true",
    machineId: env.ENGINEERING_MACHINE_ID?.trim() || undefined,
    repository: env.ENGINEERING_REPOSITORY || "h1maekawa/ai-company",
    repoDir: path.resolve(env.ENGINEERING_REPO_DIR || path.join(workspaceDir, "repo")),
    workspaceDir,
    stateDir: path.join(workspaceDir, "state"),
    worktreesDir: path.join(workspaceDir, "worktrees"),
    artifactsDir: path.join(workspaceDir, "artifacts"),
    logsDir: path.join(workspaceDir, "logs"),
    agentCommand,
    agentArgs: env.ENGINEERING_AGENT_ARGS_JSON ? jsonArgs(env.ENGINEERING_AGENT_ARGS_JSON) : agentCommand === "codex" ? ["exec", "-"] : [],
    agentAuthMode,
    codexHome: path.resolve(env.ENGINEERING_CODEX_HOME || path.join(workspaceDir, "codex-home")),
    agentCredentialName,
    keychainService: env.ENGINEERING_KEYCHAIN_SERVICE || "ai-company-engineering-worker",
    keychainAccount: env.ENGINEERING_KEYCHAIN_ACCOUNT || agentCredentialName,
    pollIntervalMs: positiveInt(env.ENGINEERING_POLL_INTERVAL_MS, 60_000),
    leaseMs: positiveInt(env.ENGINEERING_LEASE_MS, 30 * 60_000),
    maxTasksPerDay: positiveInt(env.ENGINEERING_MAX_TASKS_PER_DAY, 3),
    maxAgentRunsPerTask: positiveInt(env.ENGINEERING_MAX_AGENT_RUNS_PER_TASK, 6),
    maxFixAttempts: positiveInt(env.ENGINEERING_MAX_FIX_ATTEMPTS, 3),
    maxCiFixAttempts: positiveInt(env.ENGINEERING_MAX_CI_FIX_ATTEMPTS, 2),
    maxChangedFiles: positiveInt(env.ENGINEERING_MAX_CHANGED_FILES, 30),
    maxDiffLines: positiveInt(env.ENGINEERING_MAX_DIFF_LINES, 2_000),
    maxConcurrentTasks: 1,
    npmCacheDir: path.join(workspaceDir, "npm-cache"),
    requiredCiChecks: jsonStringArray(env.ENGINEERING_REQUIRED_CI_CHECKS_JSON, ["typecheck / build / test"]),
  };
}

export const FULL_VERIFICATION_COMMANDS = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test:architecture"]],
  ["npm", ["run", "test:qa"]],
  ["npm", ["run", "test:fund"]],
  ["npm", ["run", "test:content"]],
  ["npm", ["run", "test:maemichi"]],
  ["npm", ["run", "test:knowledge"]],
  ["npm", ["run", "test:engineering"]],
  ["npm", ["run", "build"]],
  ["git", ["diff", "--check"]],
] as const;
