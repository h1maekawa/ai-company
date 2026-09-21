import type { CommandRunner } from "./adapters";

export type AgentCredentialName = "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY";

export interface EngineeringCredentialProvider {
  loadAgentCredentials(): Promise<Readonly<Partial<Record<AgentCredentialName, string>>>>;
  checkAvailability(): Promise<boolean>;
}

export class AgentCredentialUnavailableError extends Error {
  constructor() { super("AGENT_CREDENTIAL_UNAVAILABLE"); this.name = "AgentCredentialUnavailableError"; }
}

export function credentialNameForAgent(command: string, explicit?: string): AgentCredentialName {
  if (explicit) {
    if (["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"].includes(explicit)) return explicit as AgentCredentialName;
    throw new Error("ENGINEERING_AGENT_CREDENTIAL_NAME must name an approved agent credential");
  }
  const executable = command.split("/").pop()?.toLowerCase();
  if (executable === "claude") return "ANTHROPIC_API_KEY";
  if (executable === "gemini") return "GEMINI_API_KEY";
  return "OPENAI_API_KEY";
}

export function launchAgentCompatibleEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    NODE_ENV: env.NODE_ENV || "production",
    HOME: env.HOME,
    PATH: env.ENGINEERING_WORKER_PATH || env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    TMPDIR: env.TMPDIR || "/tmp",
    LANG: env.LANG || "C.UTF-8",
  };
}

export class CodexChatGptCredentialProvider implements EngineeringCredentialProvider {
  constructor(
    private readonly runner: CommandRunner,
    private readonly command: string,
    private readonly codexHome: string,
    private readonly cwd: string,
    private readonly processEnv: NodeJS.ProcessEnv = process.env,
  ) {}

  private async assertAvailable(): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...launchAgentCompatibleEnvironment(this.processEnv),
      CODEX_HOME: this.codexHome,
    };
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]) {
      delete env[key];
    }
    const result = await this.runner.run(this.command, ["login", "status"], { cwd: this.cwd, env });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.code !== 0 || !/Logged in using ChatGPT/i.test(output)) throw new AgentCredentialUnavailableError();
  }

  async loadAgentCredentials(): Promise<Readonly<Partial<Record<AgentCredentialName, string>>>> {
    await this.assertAvailable();
    return Object.freeze({});
  }

  async checkAvailability(): Promise<boolean> {
    try { await this.assertAvailable(); return true; } catch { return false; }
  }
}

export class MacOsKeychainCredentialProvider implements EngineeringCredentialProvider {
  constructor(
    private readonly runner: CommandRunner,
    private readonly credentialName: AgentCredentialName,
    private readonly service: string,
    private readonly account: string,
    private readonly cwd: string,
  ) {}

  async loadAgentCredentials(): Promise<Readonly<Partial<Record<AgentCredentialName, string>>>> {
    const result = await this.runner.run(
      "/usr/bin/security",
      ["find-generic-password", "-a", this.account, "-s", this.service, "-w"],
      { cwd: this.cwd, env: { NODE_ENV: "production", PATH: "/usr/bin:/bin" } },
    );
    const secret = result.stdout.trim();
    if (result.code !== 0 || !secret) throw new AgentCredentialUnavailableError();
    return Object.freeze({ [this.credentialName]: secret });
  }

  async checkAvailability(): Promise<boolean> {
    try { await this.loadAgentCredentials(); return true; } catch { return false; }
  }
}

export function assertMinimalAgentCredentials(credentials: Readonly<Record<string, string>>, required: AgentCredentialName): void {
  const keys = Object.keys(credentials);
  if (keys.length !== 1 || keys[0] !== required || !credentials[required]) throw new AgentCredentialUnavailableError();
  if ("GH_TOKEN" in credentials || "GITHUB_TOKEN" in credentials) throw new AgentCredentialUnavailableError();
}
