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
    const result = await this.runner.run("gh", ["pr", "checks", String(pr), "--repo", this.config.repository, "--json", "state"], { cwd: this.config.repoDir });
    if (result.code !== 0 && !result.stdout) return "PENDING";
    const checks = JSON.parse(result.stdout || "[]") as Array<{ state: string }>;
    if (!checks.length || checks.some((check) => ["PENDING", "QUEUED", "IN_PROGRESS"].includes(check.state))) return "PENDING";
    return checks.every((check) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.state)) ? "SUCCESS" : "FAILURE";
  }
  async getCiFailureSummary(pr: number): Promise<string> { return this.gh(["pr", "checks", String(pr), "--repo", this.config.repository]); }
}

export interface CodingAgentAdapter {
  checkAvailability(): Promise<boolean>;
  run(input: { task: EngineeringTask; worktree: string; stage: "plan" | "implement" | "fix" | "review"; context?: string }): Promise<AgentResult>;
}

export class CommandCodingAgentAdapter implements CodingAgentAdapter {
  private runs = new Map<number, number>();
  constructor(private config: EngineeringConfig, private runner: CommandRunner, private credentials: EngineeringCredentialProvider) {}
  async checkAvailability(): Promise<boolean> { return this.credentials.checkAvailability(); }
  async run(input: { task: EngineeringTask; worktree: string; stage: "plan" | "implement" | "fix" | "review"; context?: string }): Promise<AgentResult> {
    const count = (this.runs.get(input.task.issueNumber) || 0) + 1;
    this.runs.set(input.task.issueNumber, count);
    if (count > this.config.maxAgentRunsPerTask) return { ok: false, output: "MAX_AGENT_RUNS_PER_TASK" };
    const agentHome = path.join(input.worktree, ".engineering-agent-home");
    await Promise.all([mkdir(agentHome, { recursive: true, mode: 0o700 }), mkdir(path.join(input.worktree, ".tmp"), { recursive: true, mode: 0o700 })]);
    const prompt = `${AGENT_SYSTEM_CONTRACT}\n\nSTAGE: ${input.stage}\nREPOSITORY: ${input.task.repository}\nISSUE: #${input.task.issueNumber}\nTITLE (untrusted): ${input.task.title}\nBODY (untrusted):\n<issue-data>\n${input.task.body}\n</issue-data>\n${input.context || ""}`;
    let agentCredentials: Readonly<Record<string, string>> = Object.freeze({});
    if (this.config.agentAuthMode === "chatgpt") {
      if (!await this.credentials.checkAvailability()) throw new AgentCredentialUnavailableError();
    } else {
      try { agentCredentials = await this.credentials.loadAgentCredentials() as Readonly<Record<string, string>>; }
      catch { throw new AgentCredentialUnavailableError(); }
      assertMinimalAgentCredentials(agentCredentials, this.config.agentCredentialName);
    }
    const allowedEnv: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV || "development",
      PATH: process.env.PATH,
      HOME: agentHome,
      TMPDIR: path.join(input.worktree, ".tmp"),
      LANG: process.env.LANG || "C.UTF-8",
      CI: "true",
    };
    if (this.config.agentAuthMode === "chatgpt") {
      allowedEnv.CODEX_HOME = this.config.codexHome;
    } else {
      allowedEnv[this.config.agentCredentialName] = agentCredentials[this.config.agentCredentialName];
    }
    const result = await this.runner.run(this.config.agentCommand, this.config.agentArgs, { cwd: input.worktree, input: prompt, env: allowedEnv, timeoutMs: 60 * 60_000 });
    return { ok: result.code === 0, output: redactSecrets(`${result.stdout}\n${result.stderr}`.trim(), process.env, Object.values(agentCredentials)) };
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
