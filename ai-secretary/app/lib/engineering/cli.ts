import { mkdir } from "node:fs/promises";
import { loadEngineeringConfig } from "./config";
import { CommandCodingAgentAdapter, GhCliAdapter, SafeCommandRunner } from "./adapters";
import { EngineeringStateStore } from "./stateStore";
import { EngineeringWorker } from "./worker";
import { MacOsKeychainCredentialProvider } from "./credentials";
import { formatDoctorChecks, runEngineeringDoctor } from "./doctor";

async function createWorker() {
  const config = loadEngineeringConfig();
  const runner = new SafeCommandRunner();
  const state = new EngineeringStateStore(config.stateDir, config.logsDir);
  const credentials = new MacOsKeychainCredentialProvider(runner, config.agentCredentialName, config.keychainService, config.keychainAccount, config.workspaceDir);
  await Promise.all([config.stateDir, config.logsDir, config.worktreesDir, config.artifactsDir].map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
  return { config, runner, state, credentials, worker: new EngineeringWorker({ config, runner, state, github: new GhCliAdapter(config, runner), agent: new CommandCodingAgentAdapter(config, runner, credentials) }) };
}

async function doctor(): Promise<number> {
  const { config, runner, credentials } = await createWorker();
  const checks = await runEngineeringDoctor({ config, runner, credentials });
  console.log(formatDoctorChecks(checks));
  console.log(`INFO mode: ${config.dryRun ? "DRY_RUN" : "LIVE"}; kill switch: ${config.enabled ? "enabled" : "disabled"}`);
  return checks.every((check) => check.ok) ? 0 : 1;
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
