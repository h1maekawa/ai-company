import { randomUUID } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { FULL_VERIFICATION_COMMANDS, type EngineeringConfig } from "./config";
import { EngineeringStateStore, hasExpiredLease } from "./stateStore";
import { classifyRisk, isEligibleIssue, reviewDiff, sanitizeBranchName, validatePushRef } from "./security";
import { runVerification, saveArtifact, type CodingAgentAdapter, type CommandRunner, type GitHubAdapter } from "./adapters";
import type { DependencyBootstrapResult, EngineeringRunAudit, EngineeringTask, EngineeringTaskType, GitHubIssue, TestResult } from "./types";

/**
 * Run `npm ci` in the ai-secretary directory of a fresh worktree.
 *
 * This is an Infrastructure step — it must complete before any coding-agent or
 * verification command runs.  Failures surface as DEPENDENCY_BOOTSTRAP_FAILED
 * (not MAX_FIX_ATTEMPTS_EXCEEDED) and must never be forwarded to the Codex fix
 * loop.
 *
 * Isolation contract:
 *  - HOME is scoped to a worker-private npm-home directory (no real macOS HOME).
 *  - NPM_CONFIG_CACHE points to a shared, worker-private cache dir.
 *  - NPM_CONFIG_USERCONFIG is /dev/null so the operator's ~/.npmrc is ignored.
 *  - No AI API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, …).
 *  - No GitHub credentials (GH_TOKEN, GITHUB_TOKEN).
 *  - --ignore-scripts prevents supply-chain script execution.
 *  - --no-audit and --no-fund suppress outbound network calls beyond the registry.
 */
export async function bootstrapDependencies(
  runner: CommandRunner,
  worktree: string,
  workspaceDir: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): Promise<DependencyBootstrapResult> {
  const npmCacheDir = path.join(workspaceDir, "npm-cache");
  const npmHomeDir = path.join(workspaceDir, "npm-home");
  await mkdir(npmCacheDir, { recursive: true, mode: 0o700 });
  await mkdir(npmHomeDir, { recursive: true, mode: 0o700 });
  const cwd = path.join(worktree, "ai-secretary");
  const startMs = Date.now();
  const env: NodeJS.ProcessEnv = {
    HOME: npmHomeDir,
    NPM_CONFIG_CACHE: npmCacheDir,
    NPM_CONFIG_USERCONFIG: "/dev/null",
    PATH: processEnv.PATH ?? "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    CI: "true",
    NODE_ENV: processEnv.NODE_ENV ?? "development",
  };
  const result = await runner.run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd, env, timeoutMs: 5 * 60_000 });
  const durationMs = Date.now() - startMs;
  if (result.code !== 0) {
    const errorOutput = (result.stderr || result.stdout || "").trim().slice(0, 2_000);
    return { attempted: true, success: false, durationMs, errorOutput };
  }
  return { attempted: true, success: true, durationMs };
}

export type WorkerDependencies = {
  config: EngineeringConfig;
  state: EngineeringStateStore;
  github: GitHubAdapter;
  agent: CodingAgentAdapter;
  runner: CommandRunner;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

function taskType(issue: GitHubIssue): EngineeringTaskType {
  const labels = issue.labels.map((label) => typeof label === "string" ? label : label.name || "");
  for (const candidate of ["feature", "bug", "test", "refactor", "docs"] as const) if (labels.includes(`type:${candidate}`)) return candidate;
  return "feature";
}

export function normalizeIssue(issue: GitHubIssue, repository: string, now = new Date()): EngineeringTask {
  return {
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body || "",
    repository,
    baseBranch: "main",
    taskType: taskType(issue),
    risk: classifyRisk(issue),
    status: "QUEUED",
    attempt: 0,
    fixAttempts: 0,
    ciFixAttempts: 0,
    updatedAt: now.toISOString(),
  };
}

function issuePriority(issue: GitHubIssue): number {
  const labels = issue.labels.map((label) => typeof label === "string" ? label : label.name || "");
  if (labels.includes("priority:critical")) return 0;
  if (labels.includes("priority:high")) return 1;
  if (labels.includes("priority:medium")) return 2;
  return 3;
}

export function selectIssue(issues: GitHubIssue[]): GitHubIssue | undefined {
  return issues.filter(isEligibleIssue).sort((a, b) => issuePriority(a) - issuePriority(b) || a.createdAt.localeCompare(b.createdAt))[0];
}

export function failureDisposition(attempts: number, maximum: number): "FIX" | "BLOCKED" {
  return attempts < maximum ? "FIX" : "BLOCKED";
}

export function ciDisposition(status: "PENDING" | "SUCCESS" | "FAILURE", attempts: number, maximum: number): "WAIT" | "READY_FOR_HUMAN_REVIEW" | "FIX" | "BLOCKED" {
  if (status === "PENDING") return "WAIT";
  if (status === "SUCCESS") return "READY_FOR_HUMAN_REVIEW";
  return failureDisposition(attempts, maximum);
}

function touch(task: EngineeringTask, status: EngineeringTask["status"], now: Date, leaseMs: number, lastStep: string): EngineeringTask {
  return { ...task, status, lastStep, updatedAt: now.toISOString(), leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString() };
}

export class EngineeringWorker {
  private now: () => Date;
  private sleep: (ms: number) => Promise<void>;
  constructor(private deps: WorkerDependencies) {
    this.now = deps.now || (() => new Date());
    this.sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async runOnce(): Promise<EngineeringRunAudit> {
    const { config, state } = this.deps;
    const startedAt = this.now().toISOString();
    const audit: EngineeringRunAudit = { runId: randomUUID(), startedAt, status: "IDLE", tests: [], fixAttempts: 0 };
    if (await this.killSwitchActive()) return this.finishAudit(audit, "BLOCKED", "KILL_SWITCH_DISABLED");
    if (await state.countRunsToday(this.now()) >= config.maxTasksPerDay) return this.finishAudit(audit, "BLOCKED", "DAILY_TASK_BUDGET_EXCEEDED");

    await this.recoverStaleTasks();
    const current = await state.read();
    if (Object.values(current.tasks).some((task) => !hasExpiredLease(task, this.now().getTime()) && !["READY_FOR_HUMAN_REVIEW", "BLOCKED", "FAILED"].includes(task.status))) {
      return this.finishAudit(audit, "BLOCKED", "ANOTHER_TASK_ACTIVE");
    }
    const issue = selectIssue(await this.deps.github.listReadyIssues());
    if (!issue) return this.finishAudit(audit, "IDLE");
    let task = normalizeIssue(issue, config.repository, this.now());
    audit.issue = issue.number;

    if (task.risk === "PROTECTED") {
      task = { ...task, status: "BLOCKED", failureReason: "HUMAN_SECURITY_REVIEW_REQUIRED", updatedAt: this.now().toISOString() };
      await state.updateTask(task);
      return this.finishAudit(audit, "BLOCKED", task.failureReason);
    }
    if (!await this.deps.agent.checkAvailability()) {
      return this.finishAudit(audit, "BLOCKED", "AGENT_CREDENTIAL_UNAVAILABLE");
    }
    if (config.dryRun) {
      try {
        const plan = await this.deps.agent.run({ task: touch(task, "PLANNING", this.now(), config.leaseMs, "dry-run-plan"), worktree: config.repoDir, stage: "plan" });
        await saveArtifact(config.artifactsDir, task, "plan.md", plan.output);
        return this.finishAudit(audit, "DRY_RUN", plan.ok ? undefined : "PLAN_FAILED");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (reason === "AGENT_CREDENTIAL_UNAVAILABLE") return this.finishAudit(audit, "BLOCKED", reason);
        throw error;
      }
    }

    try {
      task = { ...touch(task, "CLAIMED", this.now(), config.leaseMs, "claim"), attempt: task.attempt + 1, claimedAt: this.now().toISOString(), branchName: sanitizeBranchName(issue.number, issue.title) };
      if (!await state.claimTask(task, this.now().getTime())) throw new Error("ISSUE_ALREADY_CLAIMED");
      await this.deps.github.addLabel(issue.number, "ai-running");
      await this.deps.github.comment(issue.number, `Engineering Worker claimed this human-approved task. Run: ${audit.runId}`);
      audit.branch = task.branchName;

      const worktree = await this.prepareWorktree(task);
      task = touch(task, "CLAIMED", this.now(), config.leaseMs, "dependency-bootstrap"); await state.updateTask(task);
      const bootstrap = await bootstrapDependencies(this.deps.runner, worktree, config.workspaceDir);
      audit.dependencyBootstrap = bootstrap;
      if (!bootstrap.success) throw new Error("DEPENDENCY_BOOTSTRAP_FAILED");
      task = touch(task, "PLANNING", this.now(), config.leaseMs, "planning"); await state.updateTask(task);
      const plan = await this.deps.agent.run({ task, worktree, stage: "plan" });
      await saveArtifact(config.artifactsDir, task, "plan.md", plan.output);
      if (!plan.ok) throw new Error("PLANNING_FAILED");

      task = touch(task, "IMPLEMENTING", this.now(), config.leaseMs, "implementation"); await state.updateTask(task);
      const implementation = await this.deps.agent.run({ task, worktree, stage: "implement", context: `Approved plan:\n${plan.output}` });
      await saveArtifact(config.artifactsDir, task, "implementation.log", implementation.output);
      if (!implementation.ok) throw new Error("IMPLEMENTATION_FAILED");

      const changed = await this.diff(worktree);
      if (!changed.files.length) throw new Error("NO_CHANGES");
      await this.assertSafeDiff(task, changed);

      // Snapshot the file set produced by implementation. Verification commands must not
      // add new tracked files (e.g. tsconfig.tsbuildinfo from `tsc --noEmit`).
      const preVerificationFiles = new Set(changed.files);

      task = touch(task, "TESTING", this.now(), config.leaseMs, "full-verification"); await state.updateTask(task);
      let tests = await runVerification(this.deps.runner, FULL_VERIFICATION_COMMANDS, path.join(worktree, "ai-secretary"));
      await this.assertNoVerificationMutation(worktree, preVerificationFiles);
      while (tests.some((result) => !result.ok) && failureDisposition(task.fixAttempts, config.maxFixAttempts) === "FIX") {
        task = { ...touch(task, "IMPLEMENTING", this.now(), config.leaseMs, "local-fix"), fixAttempts: task.fixAttempts + 1 };
        await state.updateTask(task);
        const failure = tests.find((result) => !result.ok)!;
        const fix = await this.deps.agent.run({ task, worktree, stage: "fix", context: `Local verification failed. Fix only this failure:\n${failure.command}\n${failure.output}` });
        if (!fix.ok) break;
        await this.assertSafeDiff(task, await this.diff(worktree));
        task = touch(task, "TESTING", this.now(), config.leaseMs, "full-verification-retry"); await state.updateTask(task);
        tests = await runVerification(this.deps.runner, FULL_VERIFICATION_COMMANDS, path.join(worktree, "ai-secretary"));
        await this.assertNoVerificationMutation(worktree, preVerificationFiles);
      }
      audit.tests = tests;
      audit.fixAttempts = task.fixAttempts;
      if (tests.some((result) => !result.ok)) throw new Error("MAX_FIX_ATTEMPTS_EXCEEDED");

      task = touch(task, "REVIEWING", this.now(), config.leaseMs, "review"); await state.updateTask(task);
      const reviewedDiff = await this.diff(worktree);
      const review = await this.deps.agent.run({ task, worktree, stage: "review", context: `Review correctness, regressions, architecture/SSOT, compatibility and tests. Do not edit files. End with exactly REVIEW_PASS when there are no blocking findings, otherwise REVIEW_BLOCKED: followed by reasons.\nDiff:\n${reviewedDiff.diff}` });
      await saveArtifact(config.artifactsDir, task, "review.md", review.output);
      if (!review.ok || !/(?:^|\n)REVIEW_PASS\s*$/.test(review.output)) throw new Error("REVIEW_FAILED");
      const finalDiff = await this.diff(worktree);
      if (finalDiff.diff !== reviewedDiff.diff) throw new Error("REVIEWER_MODIFIED_WORKTREE");
      await this.assertSafeDiff(task, finalDiff);

      const commitMessage = `${task.taskType}: ${task.title.slice(0, 60)} (#${task.issueNumber})`;
      await this.mustRun("git", ["add", "--all"], worktree);
      await this.mustRun("git", ["commit", "-m", commitMessage], worktree);
      task.commit = (await this.mustRun("git", ["rev-parse", "HEAD"], worktree)).trim();
      audit.commit = task.commit;
      validatePushRef(task.branchName!);
      await this.mustRun("git", ["push", "--set-upstream", "origin", task.branchName!], worktree);

      const pr = await this.deps.github.createPullRequest({ branch: task.branchName!, title: commitMessage, body: this.pullRequestBody(task, finalDiff.files, tests, audit.runId) });
      task.pullRequestNumber = pr; audit.pullRequestNumber = pr;
      await state.updateTask(task);
      await this.deps.github.addPullRequestLabels(pr, ["ai-generated", "needs-human-review"]);
      await this.deps.github.comment(task.issueNumber, `Implementation complete and local gates passed. Pull request: #${pr}`);
      task = touch(task, "CI_WAIT", this.now(), config.leaseMs, "ci-wait"); await state.updateTask(task);

      await this.monitorCi(task, worktree, audit);
      task = { ...touch(task, "READY_FOR_HUMAN_REVIEW", this.now(), config.leaseMs, "complete"), leaseExpiresAt: undefined };
      await state.updateTask(task);
      await this.deps.github.comment(task.issueNumber, `CI passed. #${pr} is READY_FOR_HUMAN_REVIEW. This worker will not merge it.`);
      await this.deps.github.removeLabel(task.issueNumber, "ai-running");
      await state.updateHeartbeat({ online: true, lastCompletedIssue: task.issueNumber, lastHeartbeat: this.now().toISOString() });
      return this.finishAudit({ ...audit, ciStatus: "SUCCESS" }, "READY_FOR_HUMAN_REVIEW");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      task = { ...task, status: reason.startsWith("SECURITY_GATE:") || reason === "AGENT_CREDENTIAL_UNAVAILABLE" ? "BLOCKED" : "FAILED", failureReason: reason, updatedAt: this.now().toISOString(), leaseExpiresAt: undefined };
      await state.updateTask(task);
      await this.deps.github.removeLabel(task.issueNumber, "ai-running").catch(() => undefined);
      return this.finishAudit(audit, task.status, reason);
    }
  }

  private async monitorCi(task: EngineeringTask, worktree: string, audit: EngineeringRunAudit): Promise<void> {
    const pr = task.pullRequestNumber!;
    for (;;) {
      if (await this.killSwitchActive()) throw new Error("KILL_SWITCH_DISABLED");
      const status = await this.deps.github.getCiStatus(pr);
      if (status === "SUCCESS") return;
      if (status === "PENDING") {
        task = touch(task, "CI_WAIT", this.now(), this.deps.config.leaseMs, "ci-wait");
        await this.deps.state.updateTask(task);
        await this.deps.state.updateHeartbeat({ online: true, currentIssue: task.issueNumber, lastHeartbeat: this.now().toISOString() });
        await this.sleep(this.deps.config.pollIntervalMs);
        continue;
      }
      if (ciDisposition(status, task.ciFixAttempts, this.deps.config.maxCiFixAttempts) === "BLOCKED") throw new Error("MAX_CI_FIX_ATTEMPTS_EXCEEDED");
      task.ciFixAttempts += 1;
      task = touch(task, "CI_WAIT", this.now(), this.deps.config.leaseMs, "ci-fix");
      await this.deps.state.updateTask(task);
      const summary = await this.deps.github.getCiFailureSummary(pr);
      const fix = await this.deps.agent.run({ task, worktree, stage: "fix", context: `CI failed. Fix only the reported failure:\n${summary}` });
      if (!fix.ok) throw new Error("CI_FIX_FAILED");
      await this.assertSafeDiff(task, await this.diff(worktree));
      const tests = await runVerification(this.deps.runner, FULL_VERIFICATION_COMMANDS, path.join(worktree, "ai-secretary"));
      audit.tests = tests;
      if (tests.some((result) => !result.ok)) continue;
      await this.mustRun("git", ["add", "--all"], worktree);
      await this.mustRun("git", ["commit", "-m", `fix: address CI failure (#${task.issueNumber})`], worktree);
      validatePushRef(task.branchName!);
      await this.mustRun("git", ["push", "origin", task.branchName!], worktree);
    }
  }

  private async prepareWorktree(task: EngineeringTask): Promise<string> {
    const { config } = this.deps;
    await mkdir(config.worktreesDir, { recursive: true, mode: 0o700 });
    const worktree = path.join(config.worktreesDir, `issue-${task.issueNumber}`);
    await this.mustRun("git", ["fetch", "origin", "main"], config.repoDir);
    await this.mustRun("git", ["worktree", "add", "-b", task.branchName!, worktree, "origin/main"], config.repoDir);
    return worktree;
  }

  private async diff(worktree: string): Promise<{ files: string[]; diff: string }> {
    // intent-to-add makes new files visible to diff/security review without staging their content.
    await this.mustRun("git", ["add", "--intent-to-add", "--all"], worktree);
    const files = (await this.mustRun("git", ["diff", "--name-only", "origin/main"], worktree)).split("\n").filter(Boolean);
    const diff = await this.mustRun("git", ["diff", "--no-ext-diff", "origin/main"], worktree);
    return { files, diff };
  }

  private async assertSafeDiff(task: EngineeringTask, changed: { files: string[]; diff: string }): Promise<void> {
    const result = reviewDiff({ ...changed, maxChangedFiles: this.deps.config.maxChangedFiles, maxDiffLines: this.deps.config.maxDiffLines });
    await saveArtifact(this.deps.config.artifactsDir, task, "security-review.json", JSON.stringify(result, null, 2));
    if (!result.ok) throw new Error(`SECURITY_GATE:${result.reasons.join(",")}`);
  }

  /**
   * Guard that verification commands do not introduce new tracked file changes.
   *
   * Verification tools (e.g. tsc with incremental=true) may write generated cache
   * files that appear as unintended diffs.  If any file is present in the post-
   * verification diff that was NOT in the pre-verification diff produced by the
   * implementation, the run is terminated as VERIFICATION_MUTATED_WORKTREE —
   * an Infrastructure failure, not a code failure.
   *
   * This guard must never be used to blanket-restore the worktree; it only detects.
   * The correct remedy is to exclude generated files from git tracking (e.g. via
   * .gitignore), not to auto-restore.
   */
  private async assertNoVerificationMutation(worktree: string, preVerificationFiles: Set<string>): Promise<void> {
    const postDiff = await this.diff(worktree);
    const newFiles = postDiff.files.filter((f) => !preVerificationFiles.has(f));
    if (newFiles.length > 0) throw new Error(`VERIFICATION_MUTATED_WORKTREE:${newFiles.join(",")}`);
  }

  private async mustRun(command: string, args: readonly string[], cwd: string): Promise<string> {
    const result = await this.deps.runner.run(command, args, { cwd });
    if (result.code !== 0) throw new Error(`${command.toUpperCase()}_FAILED:${result.stderr || result.stdout}`);
    return result.stdout;
  }

  private pullRequestBody(task: EngineeringTask, files: string[], tests: TestResult[], runId: string): string {
    return [`Closes #${task.issueNumber}`, "", "## Implementation Summary", task.title, "", "## Architecture Notes", "Implemented by the isolated Engineering Runtime; Business Runtime is unchanged.", "", "## Files Changed", ...files.map((file) => `- \`${file}\``), "", "## Tests", ...tests.map((test) => `- ${test.ok ? "PASS" : "FAIL"}: \`${test.command}\``), "", "## Security Review", "Protected-path, secret, financial HUMAN_ONLY, main-push, merge, and production-deploy gates passed.", "", "## Known Limitations", "Human review and merge are required. The worker has no merge operation.", "", `Worker Run ID: \`${runId}\``].join("\n");
  }

  private async recoverStaleTasks(): Promise<void> {
    const snapshot = await this.deps.state.read();
    for (const task of Object.values(snapshot.tasks)) {
      if (!hasExpiredLease(task, this.now().getTime())) continue;
      const recovered = { ...task, status: "BLOCKED" as const, failureReason: "STALE_LEASE_REQUIRES_RECONCILIATION", updatedAt: this.now().toISOString(), leaseExpiresAt: undefined };
      await this.deps.state.updateTask(recovered);
      await this.deps.github.removeLabel(task.issueNumber, "ai-running").catch(() => undefined);
    }
  }

  private async killSwitchActive(): Promise<boolean> {
    if (!this.deps.config.enabled) return true;
    try { await access(path.join(this.deps.config.stateDir, "STOP")); return true; } catch { return false; }
  }

  private async finishAudit(audit: EngineeringRunAudit, status: EngineeringRunAudit["status"], failureReason?: string): Promise<EngineeringRunAudit> {
    const complete = { ...audit, status, failureReason, completedAt: this.now().toISOString() };
    await this.deps.state.appendAudit(complete);
    return complete;
  }
}

export async function checkWorkspaceWritable(directory: string): Promise<boolean> {
  try { await mkdir(directory, { recursive: true }); await access(directory); return true; } catch { return false; }
}
