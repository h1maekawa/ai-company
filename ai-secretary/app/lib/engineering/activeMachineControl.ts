import { engineeringGithub, githubCredentialAvailable } from "./githubRequests";

export const ENGINEERING_ACTIVE_MACHINES = ["home-mac", "mobile-mac", "none"] as const;
export type EngineeringActiveMachine = typeof ENGINEERING_ACTIVE_MACHINES[number];

type GitHubRequest = (path: string, init?: RequestInit) => Promise<Response>;
type ActiveMachineDependencies = {
  credentialAvailable: () => boolean;
  github: GitHubRequest;
};

const defaultDependencies: ActiveMachineDependencies = {
  credentialAvailable: githubCredentialAvailable,
  github: engineeringGithub,
};

export function isEngineeringActiveMachine(value: unknown): value is EngineeringActiveMachine {
  return typeof value === "string" && ENGINEERING_ACTIVE_MACHINES.includes(value as EngineeringActiveMachine);
}

export function assertActiveMachineMutationRequest(input: { sameOrigin: boolean; confirmedByHuman: unknown; machine: unknown }): EngineeringActiveMachine {
  if (!input.sameOrigin) throw new Error("ORIGIN_DENIED");
  if (input.confirmedByHuman !== true) throw new Error("HUMAN_CONFIRMATION_REQUIRED");
  if (!isEngineeringActiveMachine(input.machine)) throw new Error("INVALID_ACTIVE_MACHINE");
  return input.machine;
}

export async function readEngineeringActiveMachine(dependencies: ActiveMachineDependencies = defaultDependencies): Promise<EngineeringActiveMachine> {
  if (!dependencies.credentialAvailable()) throw new Error("GITHUB_CREDENTIAL_UNAVAILABLE");
  const response = await dependencies.github("/actions/variables/ENGINEERING_ACTIVE_MACHINE", { method: "GET" });
  if (!response.ok) throw new Error("ACTIVE_MACHINE_LOOKUP_FAILED");
  const payload = await response.json() as { value?: unknown };
  if (!isEngineeringActiveMachine(payload.value)) throw new Error("ACTIVE_MACHINE_STATE_INVALID");
  return payload.value;
}

export async function updateEngineeringActiveMachine(machine: EngineeringActiveMachine, dependencies: ActiveMachineDependencies = defaultDependencies): Promise<EngineeringActiveMachine> {
  if (!dependencies.credentialAvailable()) throw new Error("GITHUB_CREDENTIAL_UNAVAILABLE");
  const write = async () => {
    const response = await dependencies.github("/actions/variables/ENGINEERING_ACTIVE_MACHINE", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "ENGINEERING_ACTIVE_MACHINE", value: machine }),
    });
    if (!response.ok) throw new Error("ACTIVE_MACHINE_UPDATE_FAILED");
    return machine;
  };

  // Emergency Stop is intentionally monotonic toward less authority. It must
  // not depend on reading the current variable or on ai-running lookup.
  if (machine === "none") return write();

  const current = await readEngineeringActiveMachine(dependencies);
  if (current === machine) return current;

  if (current !== "none") throw new Error("DIRECT_MACHINE_SWITCH_DENIED");
  const runningResponse = await dependencies.github("/issues?state=open&labels=ai-running&per_page=1", { method: "GET" });
  if (!runningResponse.ok) throw new Error("ENGINEERING_TASK_LOOKUP_FAILED");
  const running = await runningResponse.json() as unknown;
  if (!Array.isArray(running)) throw new Error("ENGINEERING_TASK_LOOKUP_FAILED");
  if (running.length > 0) throw new Error("ENGINEERING_TASK_RUNNING");
  return write();
}
