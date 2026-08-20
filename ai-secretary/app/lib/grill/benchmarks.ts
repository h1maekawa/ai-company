/**
 * Grilling クロスドメイン Benchmark 定義と決定論的な評価指標。
 *
 * 目的: topicに応じてGrillingの専門性が切り替わるか（営業の専門家 / アーキテクト /
 * 投資判断支援 / 編集者）を、LLM文章のsnapshotではなく**構造で**評価する。
 *
 * ここに置くのは「シナリオ定義」と「決定論的な採点関数」だけ。
 * archetypeのようにLLMへ正解Treeを強制するものではない（LLMがより良い論点を出せばそれを採る）。
 */

import type { GrillNode } from "./types";

export interface BenchmarkScenario {
  id: string;
  name: string;
  domain: string;
  topic: string;
  /** そのtopicで出てほしい論点のシグナル（完全一致は要求しない） */
  expectedSignals: string[];
  /** そのtopicのScope外＝出てはいけない論点のシグナル */
  outOfScopeSignals: string[];
  /** Round3まで進めるか */
  multiRound?: boolean;
  /** Shared Understanding まで生成するか */
  sharedUnderstanding?: boolean;
}

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    id: "A",
    name: "A. Sales",
    domain: "営業",
    topic: "HP制作商談の受注率を上げたい",
    expectedSignals: ["kpi", "受注", "ヒアリング", "商談", "提案", "クロージング", "失注", "温度", "見積", "フォロー"],
    outOfScopeSignals: ["採用", "組織図", "資金調達", "人事評価制度"],
    multiRound: true,
    sharedUnderstanding: true,
  },
  {
    id: "B",
    name: "B. Software Architecture",
    domain: "ソフトウェア設計",
    topic: "新しいタスク管理システムを設計したい",
    expectedSignals: ["データ", "モデル", "api", "認証", "状態", "ユースケース", "デプロイ", "エラー", "移行", "連携", "スキーマ"],
    outOfScopeSignals: ["採用", "営業", "価格戦略", "資金調達"],
    multiRound: true,
    sharedUnderstanding: true,
  },
  {
    id: "C",
    name: "C. Business",
    domain: "事業モデル",
    topic: "AI受託事業の営業モデルを設計したい",
    expectedSignals: ["顧客", "icp", "価値", "価格", "獲得", "チャネル", "営業", "納品", "契約", "採算", "継続"],
    outOfScopeSignals: ["データモデル", "認証方式", "デプロイ"],
  },
  {
    id: "D",
    name: "D. Investment",
    domain: "投資ルール",
    topic: "個別株の売買ルールを決めたい",
    expectedSignals: ["銘柄", "エントリー", "購入", "売却", "損切", "利確", "リスク", "資金", "ポジション", "評価"],
    outOfScopeSignals: ["採用", "デプロイ", "記事", "商談"],
  },
  {
    id: "E",
    name: "E. Productivity",
    domain: "時間管理",
    topic: "仕事の時間管理ルールを作りたい",
    expectedSignals: ["優先", "計画", "時間", "集中", "割り込み", "繰り越し", "振り返り", "ツール", "休憩"],
    outOfScopeSignals: ["価格", "デプロイ", "銘柄", "商談"],
  },
  /* ─── Phase 5.3: クロスドメイン追加 ───────────────────────── */
  {
    id: "F",
    name: "F. Note Strategy",
    domain: "コンテンツ戦略（Note）",
    topic: "noteで月10万円を目指すための記事戦略を設計したい",
    expectedSignals: [
      "読者", "ターゲット", "悩み", "課題", "テーマ", "軸", "ポジショニング", "差別化",
      "無料", "有料", "価格", "記事", "本数", "頻度", "cta", "導線", "集客", "流入", "kpi", "収益",
    ],
    // 記事戦略なのに、システム設計や組織・採用の話へ広げていないか
    outOfScopeSignals: ["データモデル", "api", "認証", "デプロイ", "採用", "組織体制", "銘柄", "決算"],
    multiRound: true,
    sharedUnderstanding: true,
  },
  {
    id: "G",
    name: "G. Note Article",
    domain: "記事制作（Note・単発）",
    topic: "AI活用をテーマに有料noteの記事構成を壁打ちしたい",
    expectedSignals: [
      "読者", "悩み", "約束", "主張", "根拠", "事例", "構成", "見出し", "導入", "フック",
      "無料", "有料", "境界", "cta", "価格", "タイトル", "リサーチ",
    ],
    // 一本の記事なのに事業全体・組織・チャネル戦略へ広げていないか（Scope Fidelityの主眼）
    outOfScopeSignals: [
      "icp", "事業計画", "組織体制", "採用", "資金調達", "営業チャネル", "販路", "チーム編成",
      "データモデル", "api", "デプロイ", "銘柄",
    ],
  },
  {
    id: "H",
    name: "H. Investment Decision Rule",
    domain: "投資判断（決算後）",
    topic: "保有株を決算後に売るか持ち続けるかの判断ルールを設計したい",
    expectedSignals: [
      "決算", "業績", "ガイダンス", "guidance", "バリュエーション", "valuation", "シナリオ", "前提",
      "株価", "反応", "保有", "hold", "縮小", "reduce", "撤退", "exit", "再エントリー", "ポジション", "リスク", "見直し",
    ],
    // 決算後の判断なのに、投資人生全体の目標設定などへ広げていないか
    outOfScopeSignals: ["人生設計", "老後", "家計", "保険", "デプロイ", "採用", "記事", "商談"],
    multiRound: true,
    sharedUnderstanding: true,
  },
];

export function getScenario(id: string): BenchmarkScenario | undefined {
  return BENCHMARK_SCENARIOS.find((s) => s.id === id);
}

/** BENCH_SCENARIOS を解析。未指定時は全件、指定時は入力順で重複を除く。 */
export function selectBenchmarkScenarios(value?: string): BenchmarkScenario[] {
  if (value === undefined || value.trim() === "") return [...BENCHMARK_SCENARIOS];
  const ids = [...new Set(value.split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
  const unknown = ids.filter((id) => !getScenario(id));
  if (unknown.length > 0) {
    throw new Error("Unknown BENCH_SCENARIOS: " + unknown.join(", ") + ". Valid IDs: " + BENCHMARK_SCENARIOS.map((s) => s.id).join(","));
  }
  return ids.map((id) => getScenario(id) as BenchmarkScenario);
}

/* ─── 決定論的な採点 ─────────────────────────────────────── */

export type Grade = "A" | "B" | "C" | "D";

function norm(t: string): string {
  return (t || "").toLowerCase().normalize("NFKC");
}

function nodeText(n: GrillNode): string {
  return norm(`${n.title} ${n.question}`);
}

export interface ScopeFidelityResult {
  /** Scope外シグナルに触れたノード */
  outOfScopeNodes: { id: string; title: string; signal: string }[];
  outOfScopeCount: number;
  totalNodes: number;
  /** Scope内に留まっているノードの割合 */
  ratio: number;
  grade: Grade;
}

/**
 * Scope Fidelity: 与えられたtopicの範囲を守り、不必要に隣接領域へ広げていないか。
 * 例:「有料noteの記事構成」なのに会社全体のマーケ戦略を聞く → 減点。
 */
export function scoreScopeFidelity(
  nodes: GrillNode[],
  scenario: BenchmarkScenario
): ScopeFidelityResult {
  const out: ScopeFidelityResult["outOfScopeNodes"] = [];
  for (const n of nodes) {
    const text = nodeText(n);
    const hit = scenario.outOfScopeSignals.find((sig) => text.includes(norm(sig)));
    if (hit) out.push({ id: n.id, title: n.title, signal: hit });
  }
  const total = nodes.length || 1;
  const ratio = (total - out.length) / total;
  return {
    outOfScopeNodes: out,
    outOfScopeCount: out.length,
    totalNodes: nodes.length,
    ratio: Math.round(ratio * 100) / 100,
    grade: ratio >= 1 ? "A" : ratio >= 0.9 ? "B" : ratio >= 0.75 ? "C" : "D",
  };
}

/** どのテーマでも出てくる汎用論点（これだけで構成されていたら低評価） */
const GENERIC_TITLES = ["目的", "対象", "方法", "スケジュール", "予算", "その他", "概要", "全体像", "背景"];

export interface TopicSpecificityResult {
  matchedSignals: string[];
  signalCoverage: number;
  genericTitles: string[];
  grade: Grade;
}

/**
 * Topic Specificity: そのテーマ固有の意思決定になっているか。
 * expectedSignals との完全一致は要求せず、どれだけ触れているかで測る。
 */
export function scoreTopicSpecificity(
  nodes: GrillNode[],
  scenario: BenchmarkScenario
): TopicSpecificityResult {
  const all = nodes.map(nodeText).join(" ");
  const matched = scenario.expectedSignals.filter((sig) => all.includes(norm(sig)));
  const coverage = scenario.expectedSignals.length
    ? matched.length / scenario.expectedSignals.length
    : 0;

  // タイトルが汎用語“のみ”のノード（「主要な目的」等は汎用寄りとして数える）
  const generic = nodes
    .filter((n) => {
      const t = norm(n.title).replace(/[のなをに・\s]/g, "");
      return GENERIC_TITLES.some((g) => t === norm(g) || t === `主要${norm(g)}` || t === `${norm(g)}設定`);
    })
    .map((n) => n.title);

  let grade: Grade = "D";
  if (coverage >= 0.5 && generic.length === 0) grade = "A";
  else if (coverage >= 0.35 && generic.length <= 1) grade = "B";
  else if (coverage >= 0.2) grade = "C";

  return {
    matchedSignals: matched,
    signalCoverage: Math.round(coverage * 100) / 100,
    genericTitles: generic,
    grade,
  };
}

/**
 * Recommendation品質（決定論的な下限チェック）。
 * 「ケースバイケース」等の一般論・空理由・短すぎる理由を検出する。
 * 文章の良し悪しそのものは人間が判断する前提で、明らかな低品質だけを機械的に拾う。
 */
const GENERIC_RECOMMENDATION_PHRASES = [
  "ケースバイケース",
  "状況によります",
  "状況に応じて",
  "一般的には",
  "どちらでも",
  "場合によります",
];

export interface RecommendationQualityResult {
  missingRecommendation: string[];
  missingReason: string[];
  genericPhrases: { id: string; phrase: string }[];
  shortReasons: string[];
  grade: Grade;
}

export function scoreRecommendationQuality(nodes: GrillNode[]): RecommendationQualityResult {
  const missingRecommendation = nodes.filter((n) => !n.recommendation?.trim()).map((n) => n.id);
  const missingReason = nodes.filter((n) => !n.recommendationReason?.trim()).map((n) => n.id);
  const genericPhrases: { id: string; phrase: string }[] = [];
  const shortReasons: string[] = [];

  for (const n of nodes) {
    const blob = norm(`${n.recommendation} ${n.recommendationReason}`);
    const hit = GENERIC_RECOMMENDATION_PHRASES.find((p) => blob.includes(norm(p)));
    if (hit) genericPhrases.push({ id: n.id, phrase: hit });
    if ((n.recommendationReason || "").trim().length > 0 && (n.recommendationReason || "").trim().length < 25) {
      shortReasons.push(n.id);
    }
  }

  const problems = missingRecommendation.length + missingReason.length + genericPhrases.length;
  const grade: Grade =
    problems === 0 && shortReasons.length === 0
      ? "A"
      : problems === 0
        ? "B"
        : problems <= 2
          ? "C"
          : "D";

  return { missingRecommendation, missingReason, genericPhrases, shortReasons, grade };
}

/**
 * Cross-domain の使い回し検出。
 * 2つのTreeのノード見出しトークンのJaccard係数。高いほど「同じTreeの言い換え」に近い。
 */
export function treeSimilarity(a: GrillNode[], b: GrillNode[]): number {
  const tokens = (nodes: GrillNode[]) =>
    new Set(
      nodes
        .flatMap((n) => norm(n.title).split(/[\s・/、,()（）]+/))
        .map((t) => t.replace(/[のなをにとで]/g, ""))
        .filter((t) => t.length >= 2)
    );
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100) / 100;
}

/**
 * Domain Genericity: 未知domainでも固定archetypeに依存せずtopic固有Treeを作れているか。
 * 「他シナリオとの最大類似度」が低いほど良い。
 */
export function scoreDomainGenericity(similarities: number[]): { maxSimilarity: number; grade: Grade } {
  const max = similarities.length ? Math.max(...similarities) : 0;
  const grade: Grade = max <= 0.15 ? "A" : max <= 0.3 ? "B" : max <= 0.45 ? "C" : "D";
  return { maxSimilarity: max, grade };
}
