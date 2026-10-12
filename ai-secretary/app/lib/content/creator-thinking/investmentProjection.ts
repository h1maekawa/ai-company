/**
 * Investment Thinking ModelのRead-only Projection（section3/4）。
 *
 * X側は投資ロジックを一切持たない。既存の
 *  - app/lib/company/research/types.ts の IntelligenceArtifact.investmentExt
 *  - app/lib/note/investing/learningBrief.ts の InvestmentLearningBrief
 * をそのまま読むだけで、値を書き換える関数・保存する関数はこのファイルに一切持たない。
 *
 * InvestmentLearningBrief は ai/client・vault・portfolio 等への実行時依存を持つため、
 * それらを本ファイルのコンパイル対象に引き込まないよう、nominal importはせず
 * 構造的に同じ形のローカル型（InvestmentLearningBriefShape）で受け取る。
 * 呼び出し側は本物の InvestmentLearningBrief をそのまま渡せる。
 */

import type { InvestmentProjection } from "./types";
import type { IntelligenceArtifact } from "../../company/research/types";

export type { InvestmentProjection };

/** InvestmentLearningBrief（note/investing/learningBrief.ts）と同じ形の最小部分集合 */
export type InvestmentLearningBriefShape = {
  whatHappened: string;
  aiInterpretation: string;
  portfolioRelation: string;
  factsUsed: { tickers: string[]; newsIds: string[]; pnlSnapshot: string };
};

type ProjectableArtifact = Pick<
  IntelligenceArtifact,
  "topicKey" | "investmentExt" | "facts" | "interpretation" | "unknowns" | "userHypothesis"
>;

export function projectInvestmentThinking(artifact: ProjectableArtifact): InvestmentProjection | null {
  if (!artifact.investmentExt) return null;
  const ext = artifact.investmentExt;
  return {
    sourceTopicKey: artifact.topicKey,
    marketStructure: {
      demandChain: ext.demandChain ?? [],
      valueChain: ext.valueChain ?? [],
    },
    bottlenecks: (ext.bottlenecks ?? []).map((b) => ({
      name: b.name,
      constraintTypes: b.constraintTypes,
      factRefs: b.factRefs,
    })),
    candidateCompanies: (ext.companies ?? []).map((c) => ({
      name: c.name,
      ticker: c.ticker,
      role: c.role,
      factRefs: c.factRefs,
    })),
    risk: ext.risks ?? [],
    fact: { factRefs: artifact.facts.map((f) => f.id) },
    interpretation: artifact.interpretation,
    hypothesis: artifact.userHypothesis,
    unknown: artifact.unknowns,
  };
}

export function projectInvestmentLearningBrief(brief: InvestmentLearningBriefShape): {
  fact: string;
  factsUsed: InvestmentLearningBriefShape["factsUsed"];
  interpretation: string;
  portfolioRelation: string;
} {
  return {
    fact: brief.whatHappened,
    factsUsed: brief.factsUsed,
    interpretation: brief.aiInterpretation,
    portfolioRelation: brief.portfolioRelation,
  };
}
