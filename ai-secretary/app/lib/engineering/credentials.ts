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
