export type ConnectionFailureCode = "TOKEN_INVALID" | "TOKEN_FORBIDDEN" | "REPOSITORY_NOT_ACCESSIBLE" | "BRANCH_NOT_FOUND" | "VAULT_PATH_NOT_FOUND" | "UNKNOWN";
export type VaultProbeResult = { ok: boolean; failureCode?: ConnectionFailureCode; failedProbe?: "repository" | "branch" | "memory" | "knowledge"; statuses: Partial<Record<"repository" | "branch" | "memory" | "knowledge", number>> };

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "AI-Company-Vault-Diagnostics" });
export function vaultEnvironmentPresence(env: NodeJS.ProcessEnv = process.env) {
  return { GITHUB_OWNER: Boolean(env.GITHUB_OWNER?.trim()), GITHUB_REPO: Boolean(env.GITHUB_REPO?.trim()), GITHUB_BRANCH: Boolean(env.GITHUB_BRANCH?.trim()), GITHUB_PRODUCTION_BRANCH: Boolean(env.GITHUB_PRODUCTION_BRANCH?.trim()), GITHUB_TOKEN: Boolean(env.GITHUB_TOKEN?.trim()) };
}
export function configuredVaultBranch(env: NodeJS.ProcessEnv = process.env) { return env.GITHUB_BRANCH?.trim() || env.GITHUB_PRODUCTION_BRANCH?.trim() || "main"; }
export async function probeGithubRepository(input: { owner:string; repo:string; token:string; fetchImpl?:typeof fetch; signal?:AbortSignal }): Promise<{ ok:boolean; status:number; failureCode?:ConnectionFailureCode }> {
  const response = await (input.fetchImpl ?? fetch)(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`, { headers:headers(input.token), cache:"no-store", signal:input.signal });
  if (response.ok) return { ok:true, status:response.status };
  return { ok:false, status:response.status, failureCode:response.status === 401 ? "TOKEN_INVALID" : response.status === 403 ? "TOKEN_FORBIDDEN" : response.status === 404 ? "REPOSITORY_NOT_ACCESSIBLE" : "UNKNOWN" };
}
export async function probeGithubVault(input: { owner: string; repo: string; token: string; branch: string; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<VaultProbeResult> {
  const call = input.fetchImpl ?? fetch;
  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const statuses: VaultProbeResult["statuses"] = {};
  const get = async (probe: keyof VaultProbeResult["statuses"], suffix = "") => {
    const response = await call(`${base}${suffix}`, { headers: headers(input.token), cache: "no-store", signal: input.signal }); statuses[probe] = response.status; return response;
  };
  const repository = await get("repository");
  if (repository.status === 401) return { ok:false, failureCode:"TOKEN_INVALID", failedProbe:"repository", statuses };
  if (repository.status === 403) return { ok:false, failureCode:"TOKEN_FORBIDDEN", failedProbe:"repository", statuses };
  if (repository.status === 404) return { ok:false, failureCode:"REPOSITORY_NOT_ACCESSIBLE", failedProbe:"repository", statuses };
  if (!repository.ok) return { ok:false, failureCode:"UNKNOWN", failedProbe:"repository", statuses };
  const ref = `?ref=${encodeURIComponent(input.branch)}`;
  const branch = await get("branch", `/contents${ref}`);
  if (branch.status === 404) return { ok:false, failureCode:"BRANCH_NOT_FOUND", failedProbe:"branch", statuses };
  if (!branch.ok) return { ok:false, failureCode:branch.status === 401 ? "TOKEN_INVALID" : branch.status === 403 ? "TOKEN_FORBIDDEN" : "UNKNOWN", failedProbe:"branch", statuses };
  const memory = await get("memory", `/contents/memory${ref}`);
  if (memory.status === 404) return { ok:false, failureCode:"VAULT_PATH_NOT_FOUND", failedProbe:"memory", statuses };
  if (!memory.ok) return { ok:false, failureCode:"UNKNOWN", failedProbe:"memory", statuses };
  const knowledge = await get("knowledge", `/contents/memory/knowledge${ref}`);
  if (knowledge.status === 404) return { ok:false, failureCode:"VAULT_PATH_NOT_FOUND", failedProbe:"knowledge", statuses };
  if (!knowledge.ok) return { ok:false, failureCode:"UNKNOWN", failedProbe:"knowledge", statuses };
  return { ok:true, statuses };
}
