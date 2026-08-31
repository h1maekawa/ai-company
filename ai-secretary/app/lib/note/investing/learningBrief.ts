/**
 * Investment Learning Brief（投資部門 → 本人の学び）。
 *
 * 重要な原則:
 *  - 事実(FACT)はPortfolio/News SSOTのみから作る。AIは要約・解釈だけを担当する
 *  - 総資産額・現金残高・保有数量・取得単価は本人向けBriefでも書かない
 *    （X投稿より内部向けだが、SSOT外の数値を混入させない習慣を統一する）
 *  - 新しい材料（Portfolio差分 or 未使用ニュース）が無い日は無理に生成しない
 */

import { callAI } from "../../ai/client";
import { getVaultFile, saveVaultFile } from "../../vault";
import { loadPortfolio } from "../../investing/portfolio";
import { loadNews } from "../../investing/news";
import type { Portfolio } from "../../investing/types";
import type { NewsItem } from "../../investing/types";

const PATH = "memory/personal/note/investment-learning.md";
const MAX_KEPT = 60;

export type InvestmentLearningBrief = {
  id: string;
  date: string; // Tokyo YYYY-MM-DD
  hasContent: boolean;
  whatHappened: string;
  whyRelevant: string;
  termToLearn: { term: string; explanation: string };
  portfolioRelation: string;
  aiInterpretation: string;
  nextThingsToWatch: string[];
  todaysQuestion: string;
  xDraftSeed?: string;
  factsUsed: { tickers: string[]; newsIds: string[]; pnlSnapshot: string };
  createdAt: string;
};

function tokyoDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 保有銘柄の損益率スナップショットを丸めて文字列化（同一材料の重複生成を避けるためのdedupeキー） */
function pnlSnapshotKey(portfolio: Portfolio): string {
  return portfolio.positions
    .filter((p) => p.pnlPct !== null)
    .map((p) => `${p.code}:${Math.round((p.pnlPct ?? 0) * 10) / 10}`)
    .sort()
    .join("|");
}

type BriefFile = { briefs: InvestmentLearningBrief[] };

async function readFile(): Promise<BriefFile> {
  try {
    const file = await getVaultFile(PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return { briefs: [] };
    const data = JSON.parse(match[1]) as BriefFile;
    return { briefs: Array.isArray(data.briefs) ? data.briefs : [] };
  } catch {
    return { briefs: [] };
  }
}

async function writeFile(file: BriefFile): Promise<void> {
  const kept = file.briefs.slice(0, MAX_KEPT);
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(PATH)).sha;
  } catch {
    // 初回作成
  }
  const human = kept
    .slice(0, 14)
    .map((b) =>
      [
        `## ${b.date}`,
        b.hasContent ? `- 今日: ${b.whatHappened}` : "- 新しい材料がなかったため生成をスキップしました",
        b.hasContent ? `- 学ぶ言葉: ${b.termToLearn.term}` : "",
        b.hasContent ? `- 今日の1問: ${b.todaysQuestion}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const markdown = `---
type: note_investment_learning
updated: ${new Date().toISOString()}
---

# Investment Learning Brief

投資部門（Portfolio/News）から、本人が投資を学ぶための日次Briefです。
FACTはPortfolio/Newsの実データのみ。総資産額・現金残高・保有数量・取得単価はここにも書きません。

${human || "（まだありません）"}

\`\`\`json
${JSON.stringify({ briefs: kept }, null, 2)}
\`\`\`
`;
  await saveVaultFile(PATH, markdown, sha);
}

const PROMPT = `あなたは前川さん専属の「投資を学ぶ」アシスタントAIです。
与えられたPortfolio(保有銘柄・評価損益率)とNews(実際に配信された見出しの要約)だけを事実として使い、
本人が今日1つ投資の理解を深められるBriefを作ってください。

## 厳守事項
- 渡されていない数値（株価・指数・PER・決算値・総資産額・現金残高・保有数量・取得単価）を書かない
- 「買うべき」「売るべき」「絶対上がる」のような売買推奨をしない
- 評価損益を「確定利益」と書かない（含み益であることを明示する）
- 本人の意見を創作しない。AIの解釈はaiInterpretationにだけ書き、断定しすぎない
- xDraftSeedは1〜2文の短い日本語。売買推奨・断定・確定利益表現を含めない

## 出力（JSONのみ）
{
  "whatHappened": "今日/直近の材料の要約（100文字以内）",
  "whyRelevant": "なぜ保有銘柄に関係するか（80文字以内）",
  "termToLearn": { "term": "今日覚える言葉", "explanation": "60文字以内の説明" },
  "portfolioRelation": "Portfolioとの関係（80文字以内）",
  "aiInterpretation": "AIの解釈。断定しすぎない（100文字以内）",
  "nextThingsToWatch": ["次に見る数字・イベント（30文字以内）"],
  "todaysQuestion": "今日の1問（本人が考えるための問い）",
  "xDraftSeed": "Xにするとしたらの短い下書き種（任意、120文字以内）"
}`;

export async function buildInvestmentLearningBrief(
  now = new Date()
): Promise<InvestmentLearningBrief | null> {
  const portfolio = await loadPortfolio();
  const tickers = portfolio.positions
    .filter((p) => p.assetClass === "us_stock")
    .map((p) => p.code.toUpperCase());
  const news = await loadNews(tickers);

  if (portfolio.positions.length === 0 && !news.available) return null;

  const message = `【保有銘柄と評価損益率】
${
  portfolio.positions
    .filter((p) => p.pnlPct !== null)
    .map((p) => `- ${p.name}（${p.code}）: 評価損益率 ${p.pnlPct?.toFixed(1)}%`)
    .join("\n") || "（評価損益率を取得できていません）"
}

【関連ニュース見出し（実際に配信されたもの）】
${
  news.items
    .slice(0, 6)
    .map((n: NewsItem) => `- ${n.title}${n.summary ? `（要約: ${n.summary}）` : ""}`)
    .join("\n") || "（本日は新しいニュースを取得できていません）"
}`;

  let parsed: Partial<Omit<InvestmentLearningBrief, "id" | "date" | "hasContent" | "factsUsed" | "createdAt">> = {};
  try {
    const response = await callAI(message, PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]);
  } catch (error) {
    console.error("[investing/learningBrief] 生成に失敗:", error);
    return null;
  }
  if (!parsed.whatHappened || !parsed.termToLearn?.term) return null;

  const date = tokyoDate(now);
  return {
    id: `il-${date}`,
    date,
    hasContent: true,
    whatHappened: String(parsed.whatHappened),
    whyRelevant: String(parsed.whyRelevant ?? ""),
    termToLearn: {
      term: String(parsed.termToLearn.term),
      explanation: String(parsed.termToLearn.explanation ?? ""),
    },
    portfolioRelation: String(parsed.portfolioRelation ?? ""),
    aiInterpretation: String(parsed.aiInterpretation ?? ""),
    nextThingsToWatch: Array.isArray(parsed.nextThingsToWatch)
      ? parsed.nextThingsToWatch.map(String).slice(0, 5)
      : [],
    todaysQuestion: String(parsed.todaysQuestion ?? ""),
    xDraftSeed: parsed.xDraftSeed ? String(parsed.xDraftSeed) : undefined,
    factsUsed: {
      tickers: portfolio.positions.map((p) => p.code),
      newsIds: news.items.map((n) => n.id),
      pnlSnapshot: pnlSnapshotKey(portfolio),
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * 当日分のBriefを取得する。無ければ生成して保存する（同日はidempotent、再生成しない）。
 * 材料が無い日はnullを返し、呼び出し側は「本日はスキップ」を表示する。
 */
export async function getOrCreateTodayLearningBrief(
  now = new Date()
): Promise<InvestmentLearningBrief | null> {
  const date = tokyoDate(now);
  const file = await readFile();
  const existing = file.briefs.find((b) => b.date === date);
  if (existing) return existing.hasContent ? existing : null;

  const brief = await buildInvestmentLearningBrief(now);
  const toSave: InvestmentLearningBrief = brief ?? {
    id: `il-${date}`,
    date,
    hasContent: false,
    whatHappened: "",
    whyRelevant: "",
    termToLearn: { term: "", explanation: "" },
    portfolioRelation: "",
    aiInterpretation: "",
    nextThingsToWatch: [],
    todaysQuestion: "",
    factsUsed: { tickers: [], newsIds: [], pnlSnapshot: "" },
    createdAt: new Date().toISOString(),
  };
  await writeFile({ briefs: [toSave, ...file.briefs.filter((b) => b.date !== date)] });
  return brief;
}

export async function loadRecentLearningBriefs(limit = 14): Promise<InvestmentLearningBrief[]> {
  const file = await readFile();
  return file.briefs.slice(0, limit);
}
