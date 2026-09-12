/**
 * 解析結果と提案の保存 — v3.1 Phase 3 §19 / §20
 *
 * 既存の保存方式（Vault上のMarkdown + jsonブロック）に合わせる。
 * 新しい保存方式を増やさない（§19）。
 *
 * §20 の要点: Proposalの最新版だけに上書きして履歴を消さない。
 * history は Proposal 自体が持っており、保存時にそれを保つ。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import type { PatternAnalysis } from "./patternAnalyzer";
import type { OrganizationProposal } from "./proposalTypes";

const PATTERNS_DIR = "memory/patterns";
const PROPOSALS_PATH = "memory/organization-proposals/registry.md";

function tokyoDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

/* ─── Pattern（日次の解析結果） ──────────────────── */

export function patternPath(now = new Date()): string {
  return `${PATTERNS_DIR}/${tokyoDate(now)}.md`;
}

export async function savePatternAnalysis(
  analysis: PatternAnalysis,
  now = new Date()
): Promise<void> {
  const path = patternPath(now);
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }

  const markdown = `---
type: pattern_analysis
date: ${tokyoDate(now)}
status: ${analysis.status}
patterns: ${analysis.patterns.length}
---

# パターン解析 ${tokyoDate(now)}

- 状態: ${analysis.status}${analysis.reason ? `（${analysis.reason}）` : ""}
- 解析したイベント: ${analysis.eventsAnalyzed}件
- 検出したパターン: ${analysis.patterns.length}件
- signatureVersion: ${analysis.signatureVersion}

${
  analysis.patterns.length > 0
    ? analysis.patterns.map((p) => `- [${p.type}] ${p.title}（${p.sampleSize}件）`).join("\n")
    : "（検出なし）"
}

\`\`\`json
${JSON.stringify(analysis, null, 2)}
\`\`\`
`;

  try {
    await saveVaultFile(path, markdown, sha);
  } catch (error) {
    console.error("[evolution/store] パターンの保存に失敗:", error);
  }
}

export async function loadPatternAnalysis(now = new Date()): Promise<PatternAnalysis | null> {
  try {
    const file = await getVaultFile(patternPath(now));
    return extractJson<PatternAnalysis>(file.content || "");
  } catch {
    return null;
  }
}

/* ─── Proposal（レジストリ） ─────────────────────── */

type ProposalFile = { proposals: OrganizationProposal[] };

export async function loadProposals(): Promise<OrganizationProposal[]> {
  try {
    const file = await getVaultFile(PROPOSALS_PATH);
    return extractJson<ProposalFile>(file.content || "")?.proposals ?? [];
  } catch {
    return [];
  }
}

/**
 * 提案を保存する。
 *
 * 既存の提案は fingerprint で突き合わせて置き換える。
 * 今回の解析に現れなかった提案は消さずに残す
 * （観測が途切れただけで、CEOが検討中のものを消してしまわないため）。
 */
export async function saveProposals(
  incoming: OrganizationProposal[]
): Promise<OrganizationProposal[]> {
  let existing: OrganizationProposal[] = [];
  let sha: string | undefined;
  try {
    const file = await getVaultFile(PROPOSALS_PATH);
    existing = extractJson<ProposalFile>(file.content || "")?.proposals ?? [];
    sha = file.sha;
  } catch {
    // 初回作成
  }

  const merged = new Map(existing.map((p) => [p.fingerprint, p]));
  for (const proposal of incoming) merged.set(proposal.fingerprint, proposal);
  const proposals = [...merged.values()].sort((a, b) => b.score - a.score);

  const visible = proposals.filter(
    (p) => p.status === "PROPOSED" || p.status === "HIGH_PRIORITY"
  );

  const markdown = `---
type: organization_proposals
proposals: ${proposals.length}
updated: ${new Date().toISOString()}
---

# 組織変更の提案

Pattern Analyzer が観測した内容から作られた提案です。
実装は行いません（CEO承認と後続フェーズの仕事です）。

- 総数: ${proposals.length}
- CEOへ表示: ${visible.length}件
- 監視中: ${proposals.filter((p) => p.status === "WATCHING").length}件

## CEOへ表示する提案

${
  visible.length > 0
    ? visible
        .map(
          (p) =>
            `### ${p.title}\n\n- 種別: ${p.type}\n- スコア: ${p.score} / 確信度: ${p.confidence}\n- 根拠: ${p.evidence
              .slice(0, 3)
              .map((e) => `${e.label} ${e.value}${e.unit ?? ""}`)
              .join(" / ")}`
        )
        .join("\n\n")
    : "（現在ありません）"
}

\`\`\`json
${JSON.stringify({ proposals }, null, 2)}
\`\`\`
`;

  try {
    await saveVaultFile(PROPOSALS_PATH, markdown, sha);
  } catch (error) {
    console.error("[evolution/store] 提案の保存に失敗:", error);
  }
  return proposals;
}
