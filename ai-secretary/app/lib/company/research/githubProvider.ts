import { engineeringGithubRead } from "../../engineering/githubRequests";
import type { ResearchProvider, ResearchProviderItem } from "./types";
import { EXTERNAL_CONTENT_CLASSIFICATION, untrustedExternalText } from "./externalSecurity";

type GithubIssue = { title?: string; html_url?: string; body?: string | null; created_at?: string; updated_at?: string; pull_request?: unknown; labels?: Array<{ name?: string } | string> };
type WorkflowRun = { name?: string; html_url?: string; conclusion?: string; updated_at?: string; head_branch?: string };

const labelNames = (issue: GithubIssue) => (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name ?? "");

export function createGithubResearchProvider(read: typeof engineeringGithubRead = engineeringGithubRead): ResearchProvider {
  return { id: "engineering-github-read", sourceType: "github", async search(query) {
    const [issuesResult, runsResult] = await Promise.allSettled([
      read("/issues?state=open&sort=updated&direction=desc&per_page=50"),
      read("/actions/runs?status=failure&per_page=20"),
    ]);
    if (issuesResult.status === "rejected" && runsResult.status === "rejected") throw new Error("GITHUB_READ_UNAVAILABLE");
    const items: ResearchProviderItem[] = [];
    if (issuesResult.status === "fulfilled" && issuesResult.value.ok) {
      const issues = await issuesResult.value.json() as GithubIssue[];
      for (const issue of issues) {
        if (!issue.title || !issue.html_url) continue;
        const labels = labelNames(issue); const haystack = `${issue.title} ${labels.join(" ")}`.toLowerCase();
        const relevant = !query.topic || haystack.includes(query.topic.toLowerCase()) || /depend|security|blocked|bug|incident|failure|ci/.test(haystack);
        if (!relevant && items.length >= Math.ceil(query.maxItems / 2)) continue;
        items.push({ title: untrustedExternalText(issue.title, 240), summary: untrustedExternalText(issue.body ?? `Open GitHub item: ${labels.join(", ")}`), sourceUrl: issue.html_url, sourceName: issue.pull_request ? "GitHub Pull Request" : "GitHub Issue", publishedAt: issue.updated_at ?? issue.created_at, reliability: "PRIMARY", tags: [EXTERNAL_CONTENT_CLASSIFICATION, ...labels.slice(0, 10)] });
      }
    }
    if (runsResult.status === "fulfilled" && runsResult.value.ok) {
      const payload = await runsResult.value.json() as { workflow_runs?: WorkflowRun[] };
      for (const run of payload.workflow_runs ?? []) items.push({ title: untrustedExternalText(`Failed CI: ${run.name ?? "workflow"}`, 240), summary: untrustedExternalText(`Conclusion ${run.conclusion ?? "failure"}; branch ${run.head_branch ?? "unknown"}`), sourceUrl: run.html_url, sourceName: "GitHub Actions", publishedAt: run.updated_at, reliability: "PRIMARY", tags: [EXTERNAL_CONTENT_CLASSIFICATION, "failed-ci"] });
    }
    return { items: items.slice(0, query.maxItems), warnings: [issuesResult, runsResult].flatMap((result) => result.status === "rejected" ? ["GITHUB_PARTIAL_FAILURE"] : []), checkedAt: new Date().toISOString() };
  } };
}
