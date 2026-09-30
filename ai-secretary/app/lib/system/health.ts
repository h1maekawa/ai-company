import { vaultDocumentStore } from "../persistence/vaultStore";
import { supabaseKnowledgeIndexRepository } from "../persistence/supabase/knowledgeIndexRepository";
import { syncStatusRepository, type SystemSyncStatus } from "../persistence/supabase/syncStatusRepository";
import { getRedisClient, isRedisAvailable } from "../utils/redis";
import { countScheduled, isBufferConfigured } from "../note/publishing/buffer";
import type { ConnectionHealth, ConnectionStatus } from "./connections";

const CACHE_MS = 45_000;
const DEADLINE_MS = 5_000;
const now = () => new Date().toISOString();
const health = (service: string, label: string, icon: string, status: ConnectionStatus, message: string, extra: Partial<ConnectionHealth> = {}): ConnectionHealth => ({
  service, label, icon, status, message, lastCheckedAt: now(), configured: status !== "not_configured",
  authOk: null, reachable: null, lastOperationOk: null, stale: false, ...extra,
});
const unknown = (service: string, label: string, icon: string, message: string) => health(service, label, icon, "unknown", message);
const deadline = async <T>(work: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("DEADLINE_EXCEEDED")), DEADLINE_MS); })]); }
  finally { if (timer) clearTimeout(timer); }
};

async function checkVault(): Promise<ConnectionHealth> {
  const github = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);
  try {
    // Probe the source directory once. Index count does not establish source health.
    if (github) {
      const url = `https://api.github.com/repos/${encodeURIComponent(process.env.GITHUB_OWNER!)}/${encodeURIComponent(process.env.GITHUB_REPO!)}/contents/memory/knowledge?ref=${encodeURIComponent(process.env.GITHUB_BRANCH || "main")}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(DEADLINE_MS) });
      if (response.status === 401 || response.status === 403) return health("vault", "Obsidian / Vault", "🧠", "disconnected", "Vault原文の認証に失敗しました", { authOk: false, reachable: true, checkedBy: "source-directory" });
      if (!response.ok) return health("vault", "Obsidian / Vault", "🧠", "warning", `Vault原文がHTTP ${response.status}を返しました`, { reachable: true, checkedBy: "source-directory" });
    } else {
      await deadline(vaultDocumentStore.listEntries("memory/knowledge"));
    }
    return health("vault", "Obsidian / Vault", "🧠", "connected", "Vault原文のディレクトリを読み取れます", { authOk: github ? true : null, reachable: true, lastSuccessAt: now(), checkedBy: "source-directory" });
  } catch { return unknown("vault", "Obsidian / Vault", "🧠", "Vault原文の状態を確認できません"); }
}
async function checkGithub(): Promise<ConnectionHealth> {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) return health("github", "GitHub Vault", "◈", "not_configured", "GitHub Vaultは未設定です");
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(process.env.GITHUB_OWNER)}/${encodeURIComponent(process.env.GITHUB_REPO)}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(DEADLINE_MS) });
    if (response.status === 401 || response.status === 403) return health("github", "GitHub Vault", "◈", "disconnected", "GitHub認証に失敗しました", { authOk: false, reachable: true });
    return response.ok ? health("github", "GitHub Vault", "◈", "connected", "GitHubリポジトリを読み取れます", { authOk: true, reachable: true, lastSuccessAt: now(), checkedBy: "repository-read" }) : health("github", "GitHub Vault", "◈", "warning", `GitHubがHTTP ${response.status}を返しました`, { reachable: true });
  } catch { return unknown("github", "GitHub Vault", "◈", "GitHubの状態を確認できません"); }
}
async function checkSupabase(stored?: SystemSyncStatus): Promise<ConnectionHealth> {
  if (!supabaseKnowledgeIndexRepository.configured()) return health("supabase", "Supabase Knowledge Index", "⚡", "not_configured", "高速Knowledge Indexは未設定です");
  try {
    const count = await deadline(supabaseKnowledgeIndexRepository.count());
    const lastSync = stored?.last_sync_at ?? undefined;
    const stale = !lastSync || !Number.isFinite(new Date(lastSync).getTime()) || Date.now() - new Date(lastSync).getTime() > 24 * 60 * 60_000;
    return health("supabase", "Supabase Knowledge Index", "⚡", stale ? "warning" : "connected", stale ? "検索Indexは読めますが、最終同期を確認できません" : "検索Indexを読み取れます。Vault原文の状態は別表示です", { authOk: true, reachable: true, itemCount: count ?? undefined, lastSuccessAt: now(), lastOperationOk: stored?.status === "connected" ? true : stored?.status === "warning" || stored?.status === "disconnected" ? false : null, stale, checkedBy: "index-count" });
  } catch { return unknown("supabase", "Supabase Knowledge Index", "⚡", "検索Indexの状態を確認できません"); }
}
async function checkRedis(): Promise<ConnectionHealth> {
  if (!isRedisAvailable) return health("redis", "Redis", "◆", "not_configured", "Runtime State用Redisは未設定です");
  try { await deadline(getRedisClient()!.ping()); return health("redis", "Redis", "◆", "connected", "Runtime Stateへ接続できます", { reachable: true, lastSuccessAt: now(), checkedBy: "ping" }); }
  catch { return unknown("redis", "Redis", "◆", "Runtime Stateの状態を確認できません"); }
}
async function checkBuffer(): Promise<ConnectionHealth> {
  if (!isBufferConfigured()) return health("buffer", "Buffer / X", "𝕏", "not_configured", "Buffer / Xは未設定です");
  try {
    const result = await deadline(countScheduled());
    return result.ok ? health("buffer", "Buffer / X", "𝕏", "connected", "X予約キューを読み取れます", { authOk: true, reachable: true, itemCount: result.data, lastSuccessAt: now(), checkedBy: "queue-read" }) : health("buffer", "Buffer / X", "𝕏", result.error.kind === "auth" ? "disconnected" : "warning", "Bufferの予約キューを確認できません", { authOk: result.error.kind === "auth" ? false : null });
  } catch { return unknown("buffer", "Buffer / X", "𝕏", "Bufferの状態を確認できません"); }
}
async function checkSlack(): Promise<ConnectionHealth> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token && !process.env.SLACK_WEBHOOK_URL) return health("slack", "Slack", "💬", "not_configured", "Slackは未設定です");
  if (!token) return health("slack", "Slack", "💬", "unknown", "Webhookは設定済みです。配送成功は未確認です", { action: "最後の配送結果を確認してください" });
  try {
    const response = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(DEADLINE_MS) });
    const body = await response.json() as { ok?: boolean };
    return body.ok ? health("slack", "Slack", "💬", "connected", "Bot認証は有効です。配送成功は別途確認が必要です", { authOk: true, reachable: true, lastSuccessAt: now(), checkedBy: "auth.test" }) : health("slack", "Slack", "💬", "disconnected", "Slack Bot認証に失敗しました", { authOk: false, reachable: true });
  } catch { return unknown("slack", "Slack", "💬", "Slackの状態を確認できません"); }
}
function checkRunner(stored?: SystemSyncStatus): ConnectionHealth {
  if (!process.env.LOCAL_RUNNER_TOKEN) return health("note_runner", "note Runner", "▶", "not_configured", "note Runnerは未設定です");
  const last = stored?.last_success_at ?? undefined;
  if (!last) return health("note_runner", "note Runner", "▶", "unknown", "最後の接続成功を確認できません", { action: "Mac上のRunnerを確認してください" });
  const stale = !Number.isFinite(new Date(last).getTime()) || Date.now() - new Date(last).getTime() > 4 * 60 * 60_000;
  return health("note_runner", "note Runner", "▶", stale ? "warning" : "connected", stale ? "Runnerの最終接続が古くなっています" : "Runnerは最近接続しました", { lastSuccessAt: last, lastOperationOk: !stale, stale, checkedBy: "stored-heartbeat" });
}

let cached: { at: number; services: ConnectionHealth[] } | null = null;
let pending: Promise<ConnectionHealth[]> | null = null;
export async function checkAllConnections(options: { refresh?: boolean } = {}): Promise<ConnectionHealth[]> {
  if (!options.refresh && cached && Date.now() - cached.at < CACHE_MS) return cached.services;
  if (pending) return pending;
  pending = (async () => {
    let stored: SystemSyncStatus[] = [];
    if (syncStatusRepository.configured()) { try { stored = await deadline(syncStatusRepository.list()); } catch { /* individual services remain unknown */ } }
    const services = await Promise.all([checkVault(), checkGithub(), checkSupabase(stored.find((item) => item.service === "knowledge_index")), checkRedis(), checkBuffer(), Promise.resolve(checkRunner(stored.find((item) => item.service === "note_runner"))), checkSlack()]);
    cached = { at: Date.now(), services };
    return services;
  })();
  try { return await pending; }
  finally { pending = null; }
}
