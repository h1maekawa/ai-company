import type { EngineeringConfig } from "./config";
import type { CommandRunner } from "./adapters";
import type { EngineeringCredentialProvider } from "./credentials";
import { launchAgentCompatibleEnvironment } from "./credentials";
import { checkWorkspaceWritable } from "./worker";

export type DoctorCheck = { name: string; ok: boolean };

export async function runEngineeringDoctor(input: {
  config: EngineeringConfig;
  runner: CommandRunner;
  credentials: EngineeringCredentialProvider;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<DoctorCheck[]> {
  const { config, runner, credentials } = input;
  const launchEnv = launchAgentCompatibleEnvironment(input.processEnv);
  const checks: Array<[string, () => Promise<boolean>]> = [
    ["Git installed", async () => (await runner.run("git", ["--version"], { cwd: process.cwd(), env: launchEnv })).code === 0],
    ["Node installed", async () => (await runner.run("node", ["--version"], { cwd: process.cwd(), env: launchEnv })).code === 0],
    ["npm installed", async () => (await runner.run("npm", ["--version"], { cwd: process.cwd(), env: launchEnv })).code === 0],
    ["GitHub authentication", async () => (await runner.run("gh", ["auth", "status"], { cwd: config.repoDir, env: launchEnv })).code === 0],
    ["Coding agent executable", async () => (await runner.run("which", [config.agentCommand], { cwd: process.cwd(), env: launchEnv })).code === 0],
    ["Coding agent credential", async () => credentials.checkAvailability()],
    ["LaunchAgent-compatible authentication", async () => {
      const github = await runner.run("gh", ["auth", "status"], { cwd: config.repoDir, env: launchEnv });
      return github.code === 0 && await credentials.checkAvailability();
    }],
    ["Workspace writable", async () => checkWorkspaceWritable(config.workspaceDir)],
    ["Repository accessible", async () => (await runner.run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: config.repoDir, env: launchEnv })).code === 0],
    ["origin/main fetch", async () => (await runner.run("git", ["fetch", "--dry-run", "origin", "main"], { cwd: config.repoDir, env: launchEnv })).code === 0],
  ];
  const results: DoctorCheck[] = [];
  for (const [name, check] of checks) {
    let ok = false;
    try { ok = await check(); } catch { ok = false; }
    results.push({ name, ok });
  }
  return results;
}

export function formatDoctorChecks(checks: DoctorCheck[]): string {
  return checks.map((check) => `${check.ok ? "PASS" : "FAIL"} ${check.name}`).join("\n");
}
