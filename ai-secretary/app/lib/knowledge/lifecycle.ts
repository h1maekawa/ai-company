/**
 * Knowledge ライフサイクル（ADR-C, docs/14, Phase4）。
 *
 *   Capture → Inbox(captured) → AI整理 → Candidate → Human Approval → Promoted Knowledge
 *
 * - Capture / Candidate は AI Managed（memory/personal/inbox/）。
 * - Promoted / Merged は Human Managed（memory/knowledge/<domain>/、別ファイル＝案B）。
 * - 書き込みは必ず writePolicy を通す。Human Managed への書き込みは Approved 経路のみ。
 */

import { vaultDocumentStore } from "../persistence/vaultStore";
import { generateUniqueId } from "../utils/id";
import { toSlug } from "../utils/slug";
import { parseFrontmatter, asArray, asString } from "./frontmatter";
import {
  managedByForStatus,
  isKnowledgeStatus,
  type AiOrganizeResult,
  type CaptureFrontmatter,
  type CaptureSource,
  type KnowledgeStatus,
} from "./types";
import { requireCanonicalDomain, resolveDomain, type CanonicalDomain } from "./domain";
import { canAiAutoWrite, canWrite } from "./writePolicy";
import { saveKnowledge } from "../memory/knowledge";

const INBOX_DIR = "memory/personal/inbox";

export interface CaptureItem {
  path: string;
  frontmatter: CaptureFrontmatter;
  body: string;
}

function today(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

function yamlArray(v?: string[]): string {
  return `[${(v ?? []).map((x) => `"${x}"`).join(", ")}]`;
}

/** CaptureFrontmatter + body から Markdown 全文を組み立てる。 */
function buildCaptureMarkdown(fm: CaptureFrontmatter, body: string): string {
  const lines: string[] = ["---", `id: ${fm.id}`, `type: capture`, `status: ${fm.status}`, `managed_by: ${fm.managed_by}`, `source: ${fm.source}`, `created: ${fm.created}`, `updated: ${fm.updated}`];
  if (fm.title !== undefined) lines.push(`title: ${JSON.stringify(fm.title)}`);
  if (fm.domain_candidates !== undefined) lines.push(`domain_candidates: ${yamlArray(fm.domain_candidates)}`);
  if (fm.domain_resolution_required !== undefined) lines.push(`domain_resolution_required: ${fm.domain_resolution_required}`);
  if (fm.tags !== undefined) lines.push(`tags: ${yamlArray(fm.tags)}`);
  if (fm.duplicate_candidates !== undefined) lines.push(`duplicate_candidates: ${yamlArray(fm.duplicate_candidates)}`);
  if (fm.conflict_candidates !== undefined) lines.push(`conflict_candidates: ${yamlArray(fm.conflict_candidates)}`);
  if (fm.recommended_action !== undefined) lines.push(`recommended_action: ${fm.recommended_action}`);
  if (fm.promotion_targets !== undefined) lines.push(`promotion_targets: ${yamlArray(fm.promotion_targets)}`);
  if (fm.promoted_to !== undefined) lines.push(`promoted_to: ${fm.promoted_to}`);
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

function parseCaptureFile(path: string, content: string): CaptureItem {
  const parsed = parseFrontmatter(content);
  const d = parsed.data;
  const statusRaw = asString(d.status);
  const status = isKnowledgeStatus(statusRaw) ? statusRaw : "captured";
  const fm: CaptureFrontmatter = {
    id: asString(d.id),
    type: "capture",
    status,
    managed_by: asString(d.managed_by) === "human" ? "human" : "ai",
    source: (asString(d.source) || "manual") as CaptureSource,
    created: asString(d.created),
    updated: asString(d.updated),
    title: d.title !== undefined ? asString(d.title) : undefined,
    domain_candidates: d.domain_candidates
      ? (asArray(d.domain_candidates).filter((x) => resolveDomain(x).domain) as CanonicalDomain[])
      : undefined,
    domain_resolution_required:
      asString(d.domain_resolution_required) === "true"
        ? true
        : asString(d.domain_resolution_required) === "false"
          ? false
          : undefined,
    tags: d.tags ? asArray(d.tags) : undefined,
    duplicate_candidates: d.duplicate_candidates ? asArray(d.duplicate_candidates) : undefined,
    conflict_candidates: d.conflict_candidates ? asArray(d.conflict_candidates) : undefined,
    recommended_action: (["promote", "merge", "hold", "reject"] as const).includes(
      asString(d.recommended_action) as never
    )
      ? (asString(d.recommended_action) as CaptureFrontmatter["recommended_action"])
      : undefined,
    promotion_targets: d.promotion_targets ? asArray(d.promotion_targets) : undefined,
    promoted_to: d.promoted_to !== undefined ? asString(d.promoted_to) : undefined,
  };
  return { path, frontmatter: fm, body: parsed.body };
}

/* ─── Capture ────────────────────────────────────────── */

export async function captureToInbox(input: {
  content: string;
  source: CaptureSource;
  title?: string;
}): Promise<CaptureItem> {
  const id = await generateUniqueId("cap");
  const slug = toSlug(input.title || input.content.slice(0, 24)) || "capture";
  const date = today();

  let fileName = `${date}-${slug}.md`;
  try {
    const existing = await vaultDocumentStore.listFiles(INBOX_DIR);
    let n = 1;
    while (existing.includes(fileName)) {
      n++;
      fileName = `${date}-${slug}-${n}.md`;
    }
  } catch {
    // 初回
  }
  const path = `${INBOX_DIR}/${fileName}`;

  const fm: CaptureFrontmatter = {
    id,
    type: "capture",
    status: "captured",
    managed_by: managedByForStatus("captured"), // ai
    source: input.source,
    created: date,
    updated: date,
  };

  const decision = canAiAutoWrite(path, "");
  if (!decision.allowed) throw new Error(`[lifecycle] capture 書き込み拒否: ${decision.reason}`);

  const md = buildCaptureMarkdown(fm, input.content);
  await vaultDocumentStore.saveFile(path, md);
  return { path, frontmatter: fm, body: input.content };
}

/* ─── AI整理 → Candidate ─────────────────────────────── */

export async function prepareCandidate(
  path: string,
  organize: AiOrganizeResult
): Promise<CaptureItem> {
  const { content } = await vaultDocumentStore.getFile(path);
  if (!content.trim()) throw new Error(`[lifecycle] capture が見つかりません: ${path}`);
  const item = parseCaptureFile(path, content);

  const domainCandidates = organize.domainCandidates.filter((d) => resolveDomain(d).domain) as CanonicalDomain[];
  const resolutionRequired = domainCandidates.length === 0;

  const fm: CaptureFrontmatter = {
    ...item.frontmatter,
    status: "candidate",
    managed_by: managedByForStatus("candidate"), // ai
    updated: today(),
    title: organize.title || item.frontmatter.title,
    domain_candidates: domainCandidates,
    domain_resolution_required: resolutionRequired,
    tags: organize.tags,
    duplicate_candidates: organize.duplicateCandidates,
    conflict_candidates: organize.conflictCandidates,
    recommended_action: organize.recommendedAction,
    promotion_targets: organize.promotionTargets,
  };

  // AI整理の要約を本文冒頭に残す（原文は維持）
  const newBody = organize.summary
    ? `> **AI要約**: ${organize.summary}\n\n${item.body.trim()}`
    : item.body;

  const decision = canAiAutoWrite(path, content);
  if (!decision.allowed) throw new Error(`[lifecycle] candidate 更新拒否: ${decision.reason}`);

  await vaultDocumentStore.saveFile(path, buildCaptureMarkdown(fm, newBody), undefined);
  return { path, frontmatter: fm, body: newBody };
}

/* ─── 一覧・取得 ─────────────────────────────────────── */

export async function listCaptures(statuses?: KnowledgeStatus[]): Promise<CaptureItem[]> {
  let files: string[] = [];
  try {
    files = await vaultDocumentStore.listFiles(INBOX_DIR);
  } catch {
    return [];
  }
  const items: CaptureItem[] = [];
  for (const name of files) {
    if (!name.endsWith(".md") || name.startsWith("_")) continue;
    const path = `${INBOX_DIR}/${name}`;
    try {
      const { content } = await vaultDocumentStore.getFile(path);
      if (!content.trim()) continue;
      const item = parseCaptureFile(path, content);
      if (item.frontmatter.type !== "capture") continue;
      if (statuses && !statuses.includes(item.frontmatter.status)) continue;
      items.push(item);
    } catch {
      // skip
    }
  }
  items.sort((a, b) => (b.frontmatter.updated > a.frontmatter.updated ? 1 : -1));
  return items;
}

export function listCandidates(): Promise<CaptureItem[]> {
  return listCaptures(["captured", "candidate"]);
}

/* ─── 昇格 / 統合 / 保留 / 破棄 ───────────────────────── */

/** 案B: 新規 Promoted Knowledge を作成し、Candidate を promoted 状態に更新（別ファイル）。 */
export async function promoteCandidate(
  path: string,
  opts: { domain: string; title?: string; slug?: string; importance?: 1 | 2 | 3; tags?: string[] }
): Promise<{ candidate: CaptureItem; knowledgePath: string }> {
  const { content } = await vaultDocumentStore.getFile(path);
  if (!content.trim()) throw new Error(`[lifecycle] candidate が見つかりません: ${path}`);
  const item = parseCaptureFile(path, content);

  // 修正2: promotion 時は canonical domain 必須（未解決なら throw）
  const domain = requireCanonicalDomain(opts.domain);
  const title = opts.title || item.frontmatter.title || item.frontmatter.id;
  const slug = toSlug(opts.slug || title) || "knowledge";
  const tags = opts.tags ?? item.frontmatter.tags ?? [];

  // Human Approval 済みの Approved Write として正式Knowledgeを新規作成
  const saved = await saveKnowledge({
    title,
    slug,
    domain,
    importance: opts.importance ?? 2,
    content: item.body,
    status: "promoted",
    tags,
    source_ref: [item.path],
    approved: true,
  });

  // Candidate を promoted に更新（作業データは AI Managed のまま）
  const fm: CaptureFrontmatter = {
    ...item.frontmatter,
    status: "promoted",
    managed_by: managedByForStatus("candidate"), // candidateファイル自体はAI Managedのまま
    updated: today(),
    domain_candidates: [domain],
    domain_resolution_required: false,
    promoted_to: saved.path,
  };
  await vaultDocumentStore.saveFile(path, buildCaptureMarkdown(fm, item.body), undefined);

  return { candidate: { path, frontmatter: fm, body: item.body }, knowledgePath: saved.path };
}

/** 既存 Promoted Knowledge（Human Managed）へ統合する。Human Approval 済みの Approved Write。 */
export async function mergeCandidate(
  path: string,
  targetPath: string
): Promise<{ candidate: CaptureItem; targetPath: string }> {
  const { content } = await vaultDocumentStore.getFile(path);
  if (!content.trim()) throw new Error(`[lifecycle] candidate が見つかりません: ${path}`);
  const item = parseCaptureFile(path, content);

  const target = await vaultDocumentStore.getFile(targetPath);
  if (!target.content.trim()) throw new Error(`[lifecycle] 統合先Knowledgeが見つかりません: ${targetPath}`);

  // Human Managed への書き込みは Approved 経路のみ許可
  const decision = canWrite(targetPath, target.content, { approved: true, reason: "merge" });
  if (!decision.allowed) throw new Error(`[lifecycle] merge 拒否: ${decision.reason}`);

  const appended = `${target.content.trimEnd()}\n\n## 統合メモ（${today()} / ${item.frontmatter.id}）\n\n${item.body.trim()}\n`;
  await vaultDocumentStore.saveFile(targetPath, appended, target.version);

  const fm: CaptureFrontmatter = {
    ...item.frontmatter,
    status: "merged",
    managed_by: managedByForStatus("candidate"),
    updated: today(),
    promoted_to: targetPath,
  };
  await vaultDocumentStore.saveFile(path, buildCaptureMarkdown(fm, item.body), undefined);

  return { candidate: { path, frontmatter: fm, body: item.body }, targetPath };
}

/** hold / reject / archive（AI Managed の状態更新のみ）。 */
export async function setCandidateStatus(
  path: string,
  status: "hold" | "reject" | "archive"
): Promise<CaptureItem> {
  const { content } = await vaultDocumentStore.getFile(path);
  if (!content.trim()) throw new Error(`[lifecycle] candidate が見つかりません: ${path}`);
  const item = parseCaptureFile(path, content);

  const next: KnowledgeStatus = status === "hold" ? "archived" : status === "reject" ? "rejected" : "archived";
  const fm: CaptureFrontmatter = {
    ...item.frontmatter,
    status: next,
    managed_by: managedByForStatus(next),
    updated: today(),
  };

  const decision = canAiAutoWrite(path, content);
  if (!decision.allowed) throw new Error(`[lifecycle] 状態更新拒否: ${decision.reason}`);

  await vaultDocumentStore.saveFile(path, buildCaptureMarkdown(fm, item.body), undefined);
  return { path, frontmatter: fm, body: item.body };
}
