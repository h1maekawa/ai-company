import { mkdir, readFile } from "node:fs/promises";
import { loadEngineeringConfig } from "./config";
import { CommandCodingAgentAdapter, GhCliAdapter, SafeCommandRunner } from "./adapters";
import { EngineeringStateStore } from "./stateStore";
import { checkWorkspaceWritable, EngineeringWorker } from "./worker";

async function createWorker() {
  const config = loadEngineeringConfig();
  const runner = new SafeCommandRunner();
  const state = new EngineeringStateStore(config.stateDir, config.logsDir);
  await Promise.all([config.stateDir, config.logsDir, config.worktreesDir, config.artifactsDir].map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
  return { config, runner, state, worker: new EngineeringWorker({ config, runner, state, github: new GhCliAdapter(config, runner), agent: new CommandCodingAgentAdapter(config, runner) }) };
}

async function doctor(): Promise<number> {
  const { config, runner } = await createWorker();
  const checks: Array<[string, () => Promise<boolean>]> = [
    ["git installed", async () => (await runner.run("git", ["--version"], { cwd: process.cwd() })).code === 0],
    ["node installed", async () => (await runner.run("node", ["--version"], { cwd: process.cwd() })).code === 0],
    ["npm installed", async () => (await runner.run("npm", ["--version"], { cwd: process.cwd() })).code === 0],
    ["GitHub authentication available", async () => (await runner.run("gh", ["auth", "status"], { cwd: process.cwd() })).code === 0],
    ["repository accessible", async () => (await runner.run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: config.repoDir })).code === 0],
    ["main fetch possible", async () => (await runner.run("git", ["fetch", "--dry-run", "origin", "main"], { cwd: config.repoDir })).code === 0],
    ["agent command available", async () => (await runner.run("which", [config.agentCommand], { cwd: process.cwd() })).code === 0],
    ["workspace writable", async () => checkWorkspaceWritable(config.workspaceDir)],
    ["required repository configured", async () => Boolean(config.repository)],
  ];
  let ok = true;
  for (const [name, check] of checks) {
    let passed = false;
    try { passed = await check(); } catch { passed = false; }
    console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    ok &&= passed;
  }
  console.log(`INFO GITHUB_TOKEN: ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? "configured (value hidden)" : "not present; gh credential store may be used"}`);
  console.log(`INFO mode: ${config.dryRun ? "DRY_RUN" : "LIVE"}; kill switch: ${config.enabled ? "enabled" : "disabled"}`);
  return ok ? 0 : 1;
}

async function status(): Promise<number> {
  const { state, config } = await createWorker();
  const snapshot = await state.read();
  console.log(JSON.stringify({ enabled: config.enabled, dryRun: config.dryRun, maxConcurrentTasks: 1, heartbeat: snapshot.heartbeat || null, tasks: Object.values(snapshot.tasks) }, null, 2));
  return 0;
}

async function once(): Promise<number> {
  const { worker } = await createWorker();
  const result = await worker.runOnce();
  console.log(JSON.stringify(result, null, 2));
  return ["FAILED", "BLOCKED"].includes(result.status) ? 1 : 0;
}

async function daemon(): Promise<number> {
  const { worker, config, state } = await createWorker();
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });
  while (!stopping) {
    await state.updateHeartbeat({ online: true, lastHeartbeat: new Date().toISOString() });
    await worker.runOnce();
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
  await state.updateHeartbeat({ online: false, lastHeartbeat: new Date().toISOString() });
  return 0;
}

async function main() {
  const command = process.argv[2];
  const code = command === "once" ? await once() : command === "daemon" ? await daemon() : command === "status" ? await status() : command === "doctor" ? await doctor() : 2;
  if (code === 2) console.error("Usage: engineering-cli <once|daemon|status|doctor>");
  process.exitCode = code;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
