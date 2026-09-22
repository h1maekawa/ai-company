import { redactSecrets } from "./security";

const repository = () => process.env.ENGINEERING_REPOSITORY || "h1maekawa/ai-company";
const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

export function githubCredentialAvailable() { return Boolean(token()); }

export async function engineeringGithub(path: string, init?: RequestInit) {
  const credential = token();
  if (!credential) throw new Error("GITHUB_CREDENTIAL_UNAVAILABLE");
  return fetch(`https://api.github.com/repos/${repository()}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${credential}`, "x-github-api-version": "2022-11-28", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

/** Research-facing helper. It deliberately exposes GET only. */
export async function engineeringGithubRead(path: string) {
  return engineeringGithub(path, { method: "GET" });
}

export async function createEngineeringIssue(input: { title: string; body: string; labels: string[] }) {
  const safeInput = { ...input, title: redactSecrets(input.title), body: redactSecrets(input.body) };
  const response = await engineeringGithub("/issues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(safeInput) });
  if (!response.ok) throw new Error("GITHUB_ISSUE_CREATE_FAILED");
  return response.json() as Promise<{ number: number; html_url: string }>;
}

export async function getEngineeringIssue(issueNumber: number) {
  const response = await engineeringGithub(`/issues/${issueNumber}`);
  if (!response.ok) throw new Error("GITHUB_ISSUE_LOOKUP_FAILED");
  return response.json() as Promise<{ number: number; html_url: string; state: string; labels: Array<string | { name?: string }> }>;
}

export async function addAiReadyLabel(issueNumber: number) {
  const issue = await getEngineeringIssue(issueNumber);
  const labels = issue.labels.map((label) => typeof label === "string" ? label : label.name ?? "");
  if (!labels.includes("ai-engineering")) throw new Error("ISSUE_NOT_ENGINEERING_ELIGIBLE");
  if (!labels.includes("ai-ready")) {
    const response = await engineeringGithub(`/issues/${issueNumber}/labels`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ labels: ["ai-ready"] }) });
    if (!response.ok) throw new Error("AI_READY_LABEL_FAILED");
  }
  return issue;
}

export async function findWorkerPullRequest(issueNumber: number) {
  const response = await engineeringGithub("/pulls?state=all&per_page=100");
  if (!response.ok) return null;
  const pulls = await response.json() as Array<{ number: number; html_url: string; merged_at?: string | null; head?: { ref?: string } }>;
  const pull = pulls.find((item) => item.head?.ref?.startsWith(`ai/issue-${issueNumber}-`));
  return pull ? { number: pull.number, url: pull.html_url, merged: Boolean(pull.merged_at) } : null;
}
