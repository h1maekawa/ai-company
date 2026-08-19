/**
 * Knowledge Router（ADR-D / Workshop §17, docs/14）。
 *
 * 質問 → domain判定 → 候補検索 → ranking → context生成。
 * Vault全部をLLMへ送らず、関連Knowledgeだけを取り出して文脈化する層。
 * 判定はまずキーワード（決定論的・デバッグ可能）。将来 LLM 補助や semantic を足せる。
 */

import { CANONICAL_DOMAINS, type CanonicalDomain } from "./domain";
import { vaultKnowledgeSearch, type KnowledgeHit, type SearchRepository } from "./search";

/** 各 canonical domain を示唆するキーワード（小文字比較） */
const DOMAIN_KEYWORDS: Record<CanonicalDomain, string[]> = {
  sales: ["営業", "商談", "アポ", "ヒアリング", "クロージング", "受注", "失注", "トークスクリプト", "is", "fs"],
  kpi: ["kpi", "kgi", "先行指標", "遅行指標", "ファネル", "funnel", "コンバージョン", "cv", "ボトルネック", "予実", "forecast", "パイプライン"],
  investment: ["投資", "銘柄", "ポートフォリオ", "利確", "損切り", "決算", "ポジション", "ウォッチリスト", "fund", "nvda", "エントリー", "リスク"],
  "side-business": ["副業", "note", "アフィリ", "affiliate", "有料", "cta", "収益化", "マネタイズ"],
  marketing: ["マーケ", "集客", "広告", "seo", "リード", "ブランディング", "認知"],
  content: ["記事", "コンテンツ", "タイトル", "構成", "下書き", "sns", "x投稿", "youtube"],
  ai: ["ai", "llm", "プロンプト", "claude", "gpt", "gemini", "エージェント", "rag"],
  technology: ["開発", "システム", "コード", "api", "インフラ", "アーキ", "設計", "バグ", "リファクタ"],
  management: ["マネジメント", "採用", "組織", "チーム", "評価", "1on1", "育成", "権限"],
  strategy: ["戦略", "方針", "意思決定", "ロードマップ", "優先順位", "事業", "vision"],
  personal: ["習慣", "健康", "目標", "振り返り", "個人", "ルーティン", "時間管理"],
};

export type DomainDetection = { domain: CanonicalDomain; score: number };

/** 質問文から関連 domain を推定（複数返す。無ければ空） */
export function detectDomains(question: string): DomainDetection[] {
  const q = (question || "").toLowerCase();
  const scored: DomainDetection[] = [];
  for (const dom of CANONICAL_DOMAINS) {
    const kws = DOMAIN_KEYWORDS[dom];
    let hits = 0;
    for (const kw of kws) {
      if (q.includes(kw)) hits++;
    }
    if (hits > 0) scored.push({ domain: dom, score: hits });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export interface KnowledgeContext {
  question: string;
  detectedDomains: CanonicalDomain[];
  hits: KnowledgeHit[];
  /** LLM に渡せる整形済みテキスト（該当なしなら空） */
  contextText: string;
}

export interface BuildContextOptions {
  limit?: number;
  /** domain 判定を無視して全 domain を検索する */
  allDomains?: boolean;
  repository?: SearchRepository;
}

/**
 * 質問に対する Knowledge 文脈を構築する。
 * 1) domain 判定 → 2) 候補検索（ranking済み）→ 3) 上位を context 文字列化。
 */
export async function buildKnowledgeContext(
  question: string,
  options: BuildContextOptions = {}
): Promise<KnowledgeContext> {
  const repo = options.repository ?? vaultKnowledgeSearch;
  const limit = options.limit ?? 5;

  const detected = options.allDomains ? [] : detectDomains(question).map((d) => d.domain);

  const hits = await repo.search({
    text: question,
    domains: detected.length > 0 ? detected : undefined,
    limit,
  });

  const contextText =
    hits.length === 0
      ? ""
      : hits
          .map((h, i) => {
            const tags = h.tags.length ? ` [tags: ${h.tags.join(", ")}]` : "";
            return `### 参考Knowledge ${i + 1}: ${h.title}\n- domain: ${h.domain ?? "?"} / status: ${h.status} / importance: ${h.importance}${tags}\n- source: ${h.path}\n${h.snippet}`;
          })
          .join("\n\n");

  return {
    question,
    detectedDomains: detected,
    hits,
    contextText,
  };
}
