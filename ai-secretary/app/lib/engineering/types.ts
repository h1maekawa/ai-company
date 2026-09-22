export type EngineeringTaskType = "feature" | "bug" | "test" | "refactor" | "docs";
export type EngineeringRisk = "LOW" | "MEDIUM" | "HIGH" | "PROTECTED";
export type EngineeringTaskStatus =
  | "QUEUED"
  | "CLAIMED"
  | "PLANNING"
  | "IMPLEMENTING"
  | "TESTING"
  | "REVIEWING"
  | "CI_WAIT"
  | "READY_FOR_HUMAN_REVIEW"
  | "BLOCKED"
  | "FAILED";

export type EngineeringTask = {
  issueNumber: number;
  title: string;
  body: string;
  repository: string;
  baseBranch: "main";
  taskType: EngineeringTaskType;
  risk: EngineeringRisk;
  status: EngineeringTaskStatus;
  attempt: number;
  fixAttempts: number;
  ciFixAttempts: number;
  branchName?: string;
  pullRequestNumber?: number;
  claimedAt?: string;
  leaseExpiresAt?: string;
  lastStep?: string;
  commit?: string;
  failureReason?: string;
  updatedAt: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body?: string | null;
  state: "OPEN" | "CLOSED";
  labels: Array<string | { name?: string | null }>;
  createdAt: string;
};

export type TestResult = { command: string; ok: boolean; output: string };
export type ReviewResult = { ok: boolean; reasons: string[] };
export type AgentResult = { ok: boolean; output: string };

export type DependencyBootstrapResult = {
  attempted: boolean;
  success: boolean;
  durationMs: number;
  errorOutput?: string;
};

export type EngineeringRunAudit = {
  runId: string;
  issue?: number;
  branch?: string;
  commit?: string;
  pullRequestNumber?: number;
  startedAt: string;
  completedAt?: string;
  status: EngineeringTaskStatus | "IDLE" | "DRY_RUN";
  tests: TestResult[];
  fixAttempts: number;
  ciStatus?: string;
  failureReason?: string;
  dependencyBootstrap?: DependencyBootstrapResult;
};

export type WorkerHeartbeat = {
  online: boolean;
  currentIssue?: number;
  lastCompletedIssue?: number;
  lastHeartbeat: string;
};
