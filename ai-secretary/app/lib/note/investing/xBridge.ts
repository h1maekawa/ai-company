/**
 * 投資→X連携（要件4・13）。
 *
 * Investment Learning Brief（FACT + AI INTERPRETATION）から、既存X生成パイプライン
 * (research/generate.ts の generateXPosts) を再利用してX投稿案を1本作る。
 * Writer/Length検証/類似度チェック/Safety Gateは既存コードをそのまま通す。
 *
 * ここでしか行わない追加チェック（Investment Fact Gate）:
 *  - 売買推奨・断定表現を含んでいたら却下する
 *  - 総資産額・現金残高・保有数量・取得単価など非公開の数値が本文に紛れ込んでいたら却下する
 * 却下時はnullを返す。呼び出し側（dailyX.ts）は通常のtrust投稿へfallbackする（要件16）。
 */

import type { Brand, Genre, XAccount } from "../types";
import type { ContentPurpose, SocialDraft, TrendCluster } from "../research/types";
import { generateXPosts, type InvestmentPostSeed } from "../research/generate";
import type { SimilarityCandidate } from "../research/similarity";
import { getOrCreateTodayLearningBrief } from "./learningBrief";
import { loadPortfolio } from "../../investing/portfolio";
import type { Portfolio } from "../../investing/types";
import type { StyleProfile } from "../styleProfile";

const RECOMMENDATION_PATTERNS: RegExp[] = [
  /買うべき/,
  /売るべき/,
  /絶対(に)?(上がる|儲かる|下がる)/,
  /今が買い時/,
  /今が売り時/,
  /buy\s*推奨/i,
  /強く推奨/,
  /確定利益/,
  /元本保証/,
];

/** 本文に出てはいけない数値（総資産額・現金残高・保有数量・取得単価）を文字列化する */
function disallowedNumberStrings(portfolio: Portfolio): string[] {
  const numbers: (number | null | undefined)[] = [
    portfolio.summary.totalValueJpy,
    portfolio.summary.cashJpy,
  ];
  for (const position of portfolio.positions) {
    numbers.push(position.quantity, position.avgCost);
  }
  const strings = new Set<string>();
  for (const value of numbers) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    const rounded = Math.round(value);
    // 3桁未満は日付・年齢などと衝突しやすいため誤検知防止で除外する
    if (Math.abs(rounded) < 100) continue;
    strings.add(String(rounded));
    strings.add(rounded.toLocaleString("ja-JP"));
  }
  return [...strings];
}

export function runInvestmentFactGate(
  text: string,
  disallowedNumbers: string[]
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const pattern of RECOMMENDATION_PATTERNS) {
    if (pattern.test(text)) reasons.push("売買推奨・断定表現を含みます");
  }
  for (const number of disallowedNumbers) {
    if (number && text.includes(number)) reasons.push("非公開の数値（総資産・現金・数量・取得単価等）が含まれています");
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export async function tryGenerateInvestmentDraft(input: {
  brand: Brand;
  genre: Genre;
  account: XAccount;
  purpose: ContentPurpose;
  pastPosts: SimilarityCandidate[];
  styleProfile?: StyleProfile;
  now?: Date;
}): Promise<SocialDraft | null> {
  const now = input.now ?? new Date();

  let brief;
  try {
    brief = await getOrCreateTodayLearningBrief(now);
  } catch (error) {
    console.error("[investing/xBridge] Learning Brief取得に失敗:", error);
    return null;
  }
  // 新しい材料が無い日は無理に投資投稿を作らない（要件16のfallback）
  if (!brief || !brief.hasContent) return null;

  const portfolio = await loadPortfolio();
  const facts = [
    ...portfolio.positions
      .filter((p) => p.pnlPct !== null)
      .map((p) => `${p.name}（${p.code}）評価損益率 ${p.pnlPct?.toFixed(1)}%`),
    brief.whatHappened,
  ];
  const seed: InvestmentPostSeed = {
    facts,
    aiInterpretation: brief.aiInterpretation,
    // Phase1: 本人承認済みのPERSONAL OPINION登録UIは未実装。常に未設定のfallback経路（記録/観察/学びとして書く）を使う
    personalOpinion: undefined,
    disallowedNumbers: disallowedNumberStrings(portfolio),
  };

  const nowIso = now.toISOString();
  const cluster: TrendCluster = {
    id: `investment-${brief.date}`,
    title: brief.whatHappened.slice(0, 80),
    summary: brief.portfolioRelation,
    genreIds: [input.genre.id],
    researchItemIds: [],
    sourceCount: brief.factsUsed.newsIds.length,
    firstDetectedAt: nowIso,
    lastDetectedAt: nowIso,
    trendScore: 0,
    brandFitScore: 25,
    experienceFitScore: 0,
    monetizationFitScore: 0,
    originalityScore: 15,
    totalScore: 40,
    penalties: [],
    blocked: false,
    matchedExperienceIds: [],
    status: "selected",
  };

  const result = await generateXPosts({
    cluster,
    items: [],
    experiences: [],
    brand: input.brand,
    genre: input.genre,
    account: input.account,
    purpose: input.purpose,
    pastPosts: input.pastPosts,
    outputType: "x-post",
    length: "short",
    sourceContext: { type: "investment", seed },
    styleProfile: input.styleProfile,
  });

  const candidate = result.drafts.find((draft) => !draft.failureReason);
  if (!candidate) return null;

  const gate = runInvestmentFactGate(candidate.text, seed.disallowedNumbers);
  if (!gate.ok) {
    console.warn("[investing/xBridge] Investment Fact Gateで却下:", gate.reasons, candidate.id);
    return null;
  }
  return candidate;
}
