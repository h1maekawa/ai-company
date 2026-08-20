/**
 * AI整理（organize）— Capture を Candidate 化するための分析（ADR-C, docs/14, Phase4）。
 *
 * 生成物: 要約 / タイトル / domain候補 / tags / 重複候補 / 矛盾候補 / 推奨アクション / 昇格先候補。
 * LLM 呼び出しが失敗しても決定論的フォールバックで必ず結果を返す（never throw）。
 */

import { callAI, type AIProvider } from "../ai/client";
import { vaultKnowledgeSearch } from "./search";
import { CANONICAL_DOMAINS, resolveDomain, type CanonicalDomain } from "./domain";
import type { AiOrganizeResult, RecommendedAction } from "./types";

const ORGANIZE_PROMPT = `あなたは個人ナレッジ基盤の「Knowledge整理担当」です。
与えられたテキスト（会話・調査・作業ログ等）を、再利用可能なKnowledge候補に整理します。
必ず以下のJSONのみを返してください（前後の説明・マークダウン禁止）。

{
  "summary": "3-5文の日本語要約",
  "title": "簡潔なタイトル（30字以内）",
  "domainCandidates": ["以下の11種のうち該当するもの（0-2個）"],
  "tags": ["日本語/英語タグ 3-6個"],
  "recommendedAction": "promote | merge | hold | reject のいずれか"
}

domain は必ず次の11種から選ぶ（該当が無ければ空配列）:
sales, kpi, investment, side-business, marketing, content, ai, technology, management, strategy, personal

判断指針:
- 再利用価値が高く独立した知見 → promote
- 既存Knowledgeの補強・追記が妥当 → merge
- 情報不足・要確認 → hold
- ノイズ・不要 → reject`;

function tryParseJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fallbackTitle(content: string): string {
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "無題";
  return firstLine.slice(0, 30);
}

/**
 * Capture 本文を整理して AiOrganizeResult を返す。LLM 失敗時も決定論的に返す。
 */
export async function organizeCaptureItem(
  content: string,
  opts: { provider?: AIProvider } = {}
): Promise<AiOrganizeResult> {
  let summary = "";
  let title = fallbackTitle(content);
  let domainCandidates: CanonicalDomain[] = [];
  let tags: string[] = [];
  let recommendedAction: RecommendedAction = "hold";

  try {
    const raw = await callAI(content.slice(0, 6000), ORGANIZE_PROMPT, {
      provider: opts.provider ?? "auto",
    });
    const parsed = tryParseJson(raw);
    if (parsed) {
      if (typeof parsed.summary === "string") summary = parsed.summary;
      if (typeof parsed.title === "string" && parsed.title.trim()) title = parsed.title.trim().slice(0, 40);
      if (Array.isArray(parsed.domainCandidates)) {
        domainCandidates = (parsed.domainCandidates as unknown[])
          .map((d) => resolveDomain(String(d)).domain)
          .filter((d): d is CanonicalDomain => Boolean(d));
        // 重複除去
        domainCandidates = Array.from(new Set(domainCandidates)).slice(0, 2);
      }
      if (Array.isArray(parsed.tags)) {
        tags = (parsed.tags as unknown[]).map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
      }
      const act = String(parsed.recommendedAction || "").toLowerCase();
      if (act === "promote" || act === "merge" || act === "hold" || act === "reject") {
        recommendedAction = act as RecommendedAction;
      }
    }
  } catch (e) {
    console.warn("[organize] LLM整理に失敗、フォールバックを使用:", e);
  }

  if (!summary) summary = content.replace(/\s+/g, " ").trim().slice(0, 200);

  // 重複/昇格先候補: 既存Knowledgeを検索（決定論的）
  let duplicateCandidates: string[] = [];
  try {
    const hits = await vaultKnowledgeSearch.search({
      text: `${title} ${tags.join(" ")}`.trim() || title,
      limit: 3,
    });
    duplicateCandidates = hits.filter((h) => h.score >= 40).map((h) => h.path);
  } catch {
    duplicateCandidates = [];
  }

  // domain が確定していない場合、promote は推奨しない（Human が確定する必要あり）
  if (domainCandidates.length === 0 && recommendedAction === "promote") {
    recommendedAction = "hold";
  }
  // 重複が強い場合は merge を優先提案
  if (duplicateCandidates.length > 0 && recommendedAction === "promote") {
    recommendedAction = "merge";
  }

  return {
    summary,
    title,
    domainCandidates,
    tags,
    duplicateCandidates,
    conflictCandidates: [], // 現状は重複検出のみ。矛盾検出は将来のsemantic比較で強化。
    recommendedAction,
    promotionTargets: duplicateCandidates,
  };
}

export const ALL_DOMAINS = CANONICAL_DOMAINS;
