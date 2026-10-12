/**
 * Investment Thinking ModelのRead-only Projection（section3/4）。
 *
 * X側は投資ロジックを一切持たない。既存の
 *  - app/lib/company/research/types.ts の IntelligenceArtifact.investmentExt（Canonical）
 * をそのまま直接importして読むだけで、値を書き換える関数・保存する関数はこのファイルに一切持たない。
 * IntelligenceArtifact側は純粋な型定義ファイル（実行時依存なし）のため、直接importしても
 * 型の重複・driftは発生しない。
 *
 * app/lib/note/investing/learningBrief.ts の InvestmentLearningBrief は再監査の結果、
 * 直接import（nominal import）を試みたが、`learningBrief.ts` が値としてimportする
 * `investing/news.ts` が Next.js の `fetch(url, { next: { revalidate } })` 拡張型に依存しており、
 * test-content.sh の単体tsc呼び出し（next-env.d.ts/tsconfigのプロジェクトcontextを持たない）では
 * `TS2769: Object literal may only specify known properties, and 'next' does not exist in type
 * 'RequestInit'` で実際にコンパイルが壊れることを確認した（`npm run typecheck` では発生しない。
 * プロジェクト全体のtsconfigにはNext.js型拡張が含まれるため）。
 * このテスト境界を越えてInvesting側ファイル群をContent Business OSのコンパイル対象へ
 * 引き込むのは変更範囲として不適切なため、InvestmentLearningBriefは構造的に同じ形の
 * ローカル型（InvestmentLearningBriefShape）で受け取る。呼び出し側は本物の
 * InvestmentLearningBriefをそのまま渡せる（値は複製しない。型の表層だけを再掲している）。
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
