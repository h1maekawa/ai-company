import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EngineeringConfig } from "./config";
import { AGENT_SYSTEM_CONTRACT, redactSecrets, validatePushRef } from "./security";
import { AgentCredentialUnavailableError, assertMinimalAgentCredentials, type EngineeringCredentialProvider } from "./credentials";
import type { AgentResult, EngineeringTask, GitHubIssue, TestResult } from "./types";

export type CommandResult = { code: number; stdout: string; stderr: string };

export interface CommandRunner {
  run(command: string, args: readonly string[], options: { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<CommandResult>;
}

export class SafeCommandRunner implements CommandRunner {
  run(command: string, args: readonly string[], options: { cwd: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], { cwd: options.cwd, env: options.env || process.env, shell: false, stdio: "pipe" });
      let stdout = "";
      let stderr = "";
      const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), options.timeoutMs) : undefined;
      const appendBounded = (current: string, chunk: unknown) => `${current}${String(chunk)}`.slice(-1_000_000);
      child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
      child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code: code ?? 1, stdout: redactSecrets(stdout), stderr: redactSecrets(stderr) });
      });
      if (options.input) child.stdin.write(options.input);
      child.stdin.end();
    });
  }
}

export interface GitHubAdapter {
  listReadyIssues(): Promise<GitHubIssue[]>;
  addLabel(issue: number, label: "ai-running"): Promise<void>;
  removeLabel(issue: number, label: "ai-running"): Promise<void>;
  comment(issue: number, body: string): Promise<void>;
  createPullRequest(input: { branch: string; title: string; body: string }): Promise<number>;
  addPullRequestLabels(pr: number, labels: string[]): Promise<void>;
  getCiStatus(pr: number): Promise<"PENDING" | "SUCCESS" | "FAILURE">;
  getCiFailureSummary(pr: number): Promise<string>;
}

export class GhCliAdapter implements GitHubAdapter {
  constructor(private config: EngineeringConfig, private runner: CommandRunner) {}
  private async gh(args: string[]): Promise<string> {
    const result = await this.runner.run("gh", args, { cwd: this.config.repoDir });
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "GH_COMMAND_FAILED");
    return result.stdout;
  }
  async listReadyIssues(): Promise<GitHubIssue[]> {
    const output = await this.gh(["issue", "list", "--repo", this.config.repository, "--state", "open", "--label", "ai-engineering", "--label", "ai-ready", "--limit", "100", "--json", "number,title,body,state,labels,createdAt"]);
    return JSON.parse(output) as GitHubIssue[];
  }
  async addLabel(issue: number, label: "ai-running"): Promise<void> { await this.gh(["issue", "edit", String(issue), "--repo", this.config.repository, "--add-label", label]); }
  async removeLabel(issue: number, label: "ai-running"): Promise<void> { await this.gh(["issue", "edit", String(issue), "--repo", this.config.repository, "--remove-label", label]); }
  async comment(issue: number, body: string): Promise<void> { await this.gh(["issue", "comment", String(issue), "--repo", this.config.repository, "--body", body]); }
  async createPullRequest(input: { branch: string; title: string; body: string }): Promise<number> {
    validatePushRef(input.branch);
    const output = await this.gh(["pr", "create", "--repo", this.config.repository, "--base", "main", "--head", input.branch, "--title", input.title, "--body", input.body]);
    const match = output.match(/\/pull\/(\d+)/);
    if (!match) throw new Error("PR_NUMBER_NOT_FOUND");
    return Number(match[1]);
  }
  async addPullRequestLabels(pr: number, labels: string[]): Promise<void> { await this.gh(["pr", "edit", String(pr), "--repo", this.config.repository, "--add-label", labels.join(",")]); }
  async getCiStatus(pr: number): Promise<"PENDING" | "SUCCESS" | "FAILURE"> {
    const result = await this.runner.run("gh", ["pr", "checks", String(pr), "--repo", this.config.repository, "--json", "name,state"], { cwd: this.config.repoDir });
    if (result.code !== 0 && !result.stdout) return "PENDING";
    const allChecks = JSON.parse(result.stdout || "[]") as Array<{ name: string; state: string }>;
    const requiredNames = this.config.requiredCiChecks;
    // Each required check name must have at least one matching actual check (substring match).
    // If any required check has not appeared yet, the checks are still pending.
    for (const requiredName of requiredNames) {
      if (!allChecks.some((c) => c.name.includes(requiredName))) return "PENDING";
    }
    const requiredChecks = allChecks.filter((c) => requiredNames.some((name) => c.name.includes(name)));
    if (requiredChecks.some((c) => ["PENDING", "QUEUED", "IN_PROGRESS"].includes(c.state))) return "PENDING";
    return requiredChecks.every((c) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(c.state)) ? "SUCCESS" : "FAILURE";
  }
  async getCiFailureSummary(pr: number): Promise<string> { return this.gh(["pr", "checks", String(pr), "--repo", this.config.repository]); }
}

export interface CodingAgentAdapter {
  checkAvailability(): Promise<boolean>;
  run(input: { task: EngineeringTask; worktree: string; stage: "plan" | "implement" | "fix" | "review"; context?: string }): Promise<AgentResult>;
}

/**
 * Builds Codex exec args for ChatGPT mode that configure child-command isolation.
 *
 * The Codex launcher process itself runs with the real macOS HOME so that
 * Security.framework can resolve the login Keychain for ChatGPT OAuth.
 * Commands launched by Codex must not inherit that HOME.  We use Codex's
 * shell_environment_policy to give spawned commands an isolated worktree HOME
 * and an explicit minimal allowlist, keeping the launcher HOME out of the
 * child environment entirely.
 *
 * Do not pass ~/Library/Keychains or CODEX_HOME into the child environment.
 */
function buildChatGptCodexArgs(
  baseArgs: readonly string[],
  agentHome: string,
  agentTmp: string,
  processEnv: NodeJS.ProcessEnv,
): string[] {
  const runtimePath = processEnv.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  const runtimeLang = processEnv.LANG || "C.UTF-8";
  const runtimeNodeEnv = processEnv.NODE_ENV || "development";
  const isolationArgs = [
    "-s", "workspace-write",
    "-c", "shell_environment_policy.inherit=none",
    "-c", "allow_login_shell=false",
    "-c", "sandbox_workspace_write.network_access=false",
    "-c", "shell_environment_policy.ignore_default_excludes=false",
    "-c", `shell_environment_policy.env.HOME="${agentHome}"`,
    "-c", `shell_environment_policy.env.TMPDIR="${agentTmp}"`,
    "-c", `shell_environment_policy.env.PATH="${runtimePath}"`,
    "-c", `shell_environment_policy.env.LANG="${runtimeLang}"`,
    "-c", 'shell_environment_policy.env.CI="true"',
    "-c", `shell_environment_policy.env.NODE_ENV="${runtimeNodeEnv}"`,
  ];
  // Insert isolation args before the last element (stdin marker "-" or prompt).
  if (baseArgs.length === 0) return isolationArgs;
  return [...baseArgs.slice(0, -1), ...isolationArgs, baseArgs[baseArgs.length - 1]];
}

export class CommandCodingAgentAdapter implements CodingAgentAdapter {
  private runs = new Map<number, number>();
  constructor(
    private config: EngineeringConfig,
    private runner: CommandRunner,
    private credentials: EngineeringCredentialProvider,
    private processEnv: NodeJS.ProcessEnv = process.env,
  ) {}
  async checkAvailability(): Promise<boolean> { return this.credentials.checkAvailability(); }
  async run(input: { task: EngineeringTask; worktree: string; stage: "plan" | "implement" | "fix" | "review"; context?: string }): Promise<AgentResult> {
    const count = (this.runs.get(input.task.issueNumber) || 0) + 1;
    this.runs.set(input.task.issueNumber, count);
    if (count > this.config.maxAgentRunsPerTask) return { ok: false, output: "MAX_AGENT_RUNS_PER_TASK" };
    const agentHome = path.join(input.worktree, ".engineering-agent-home");
    const agentTmp = path.join(input.worktree, ".tmp");
    await Promise.all([mkdir(agentHome, { recursive: true, mode: 0o700 }), mkdir(agentTmp, { recursive: true, mode: 0o700 })]);
    const prompt = `${AGENT_SYSTEM_CONTRACT}\n\nSTAGE: ${input.stage}\nREPOSITORY: ${input.task.repository}\nISSUE: #${input.task.issueNumber}\nTITLE (untrusted): ${input.task.title}\nBODY (untrusted):\n<issue-data>\n${input.task.body}\n</issue-data>\n${input.context || ""}`;
    let agentCredentials: Readonly<Record<string, string>> = Object.freeze({});
    let runEnv: NodeJS.ProcessEnv;
    let runArgs: readonly string[];
    if (this.config.agentAuthMode === "chatgpt") {
      if (!await this.credentials.checkAvailability()) throw new AgentCredentialUnavailableError();
      // In ChatGPT mode the Codex launcher receives the real macOS HOME only so
      // Security.framework can resolve the login Keychain.  Commands launched by
      // Codex do not inherit that HOME: they execute with an isolated worktree
      // HOME and an explicit environment allowlist configured via Codex args.
      const realHome = this.processEnv.HOME;
      if (!realHome) throw new AgentCredentialUnavailableError();
      runEnv = {
        HOME: realHome,
        CODEX_HOME: this.config.codexHome,
        PATH: this.processEnv.PATH,
        LANG: this.processEnv.LANG || "C.UTF-8",
        CI: "true",
        NODE_ENV: this.processEnv.NODE_ENV || "development",
        TMPDIR: agentTmp,
      };
      runArgs = buildChatGptCodexArgs(this.config.agentArgs, agentHome, agentTmp, this.processEnv);
    } else {
      try { agentCredentials = await this.credentials.loadAgentCredentials() as Readonly<Record<string, string>>; }
      catch { throw new AgentCredentialUnavailableError(); }
      assertMinimalAgentCredentials(agentCredentials, this.config.agentCredentialName);
      runEnv = {
        NODE_ENV: this.processEnv.NODE_ENV || "development",
        PATH: this.processEnv.PATH,
        HOME: agentHome,
        TMPDIR: agentTmp,
        LANG: this.processEnv.LANG || "C.UTF-8",
        CI: "true",
        [this.config.agentCredentialName]: agentCredentials[this.config.agentCredentialName],
      };
      runArgs = this.config.agentArgs;
    }
    const result = await this.runner.run(this.config.agentCommand, runArgs, { cwd: input.worktree, input: prompt, env: runEnv, timeoutMs: 60 * 60_000 });
    // Separate semantic output (stdout) from CLI diagnostics (stderr).
    // Review decisions are made against stdout only; stderr is never mixed into output.
    const credentialValues = Object.values(agentCredentials);
    const output = redactSecrets(result.stdout.trim(), this.processEnv, credentialValues);
    const rawDiagnostics = result.stderr.trim().slice(0, 5_000);
    const diagnostics = redactSecrets(rawDiagnostics, this.processEnv, credentialValues);
    return diagnostics ? { ok: result.code === 0, output, diagnostics } : { ok: result.code === 0, output };
  }
}

export async function saveArtifact(directory: string, task: EngineeringTask, name: string, content: string): Promise<void> {
  const taskDir = path.join(directory, `issue-${task.issueNumber}`);
  await mkdir(taskDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(taskDir, name), `${redactSecrets(content)}\n`, { mode: 0o600 });
}

export async function runVerification(runner: CommandRunner, commands: ReadonlyArray<readonly [string, readonly string[]]>, cwd: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (const [command, args] of commands) {
    const result = await runner.run(command, args, { cwd, timeoutMs: 30 * 60_000 });
    results.push({ command: [command, ...args].join(" "), ok: result.code === 0, output: `${result.stdout}\n${result.stderr}`.trim().slice(-20_000) });
    if (result.code !== 0) break;
  }
  return results;
}
