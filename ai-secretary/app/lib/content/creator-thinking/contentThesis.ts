/**
 * Content Thesis（section17）。
 * Draft前に必ず生成する中間契約。ResearchItem/AIThinkingModelOutput/InvestmentProjectionから
 * 直接本文を生成せず、必ずこのThesisを経由させるための純関数。
 */

import type { AIThinkingModelOutput, ContentThesis, CreatorContentPurpose, InvestmentProjection } from "./types";

function newThesisId(): string {
  return `thesis_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function buildContentThesisFromAIThinking(input: {
  output: AIThinkingModelOutput;
  purpose: CreatorContentPurpose;
  creatorFitReason: string;
}): ContentThesis {
  const { output } = input;
  return {
    id: newThesisId(),
    sourceThinkingOutputId: output.id,
    whatHappened: output.fact.statement,
    whyItMatters: output.whyItMatters,
    myInterpretation: output.currentInterpretation,
    audienceTakeaway: [output.practicalImpact, output.personalOrSmeImpact].filter((s) => s.trim() !== "").join(" "),
    unknownCaveat: output.unknown,
    intendedPurpose: input.purpose,
    creatorFitReason: input.creatorFitReason,
    createdAt: new Date().toISOString(),
  };
}

/** Investment系はRead-only Projectionからのみ生成する。投資ロジック自体はここに持たない */
export function buildContentThesisFromInvestmentProjection(input: {
  projection: InvestmentProjection;
  purpose: CreatorContentPurpose;
  creatorFitReason: string;
}): ContentThesis {
  const { projection } = input;
  return {
    id: newThesisId(),
    sourceThinkingOutputId: projection.sourceTopicKey,
    whatHappened: projection.interpretation.join(" "),
    whyItMatters: projection.risk.join(" "),
    myInterpretation: projection.hypothesis ?? "",
    audienceTakeaway: projection.candidateCompanies.map((c) => c.name).join(", "),
    unknownCaveat: projection.unknown,
    intendedPurpose: input.purpose,
    creatorFitReason: input.creatorFitReason,
    createdAt: new Date().toISOString(),
  };
}
