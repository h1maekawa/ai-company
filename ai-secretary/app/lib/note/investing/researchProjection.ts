import type { InvestmentResearchArtifact, ResearchClaim } from "../../investing/intelligence/thinkingResearch";

export type InvestmentProjectionType = "LEARNING" | "INSIGHT" | "MARKET_STRUCTURE" | "COMPANY_COMPARISON" | "INVESTMENT_THESIS";
export type InvestmentResearchProjection = { type: InvestmentProjectionType; modelVersion: string; facts: string[]; interpretation: string; hypothesis: string | null; unknowns: string[]; sourceEvidenceIds: string[]; eligible: boolean; reason: string | null };

const statements = (claims: ResearchClaim[], kind: ResearchClaim["kind"]) => claims.filter((item) => item.kind === kind);

/** Read-only projection. It cannot persist, approve, schedule, publish, or mutate research. */
export function projectInvestmentResearchForX(artifact: InvestmentResearchArtifact, type: InvestmentProjectionType): InvestmentResearchProjection {
  const facts = statements(artifact.claims, "FACT");
  const interpretations = statements(artifact.claims, "INTERPRETATION");
  const hypotheses = statements(artifact.claims, "HYPOTHESIS");
  const minimumFacts = type === "LEARNING" ? 1 : type === "INSIGHT" ? 2 : 3;
  const structuralDepth = type === "MARKET_STRUCTURE" ? artifact.marketStructure.causalPaths.length > 0 : type === "COMPANY_COMPARISON" ? artifact.companies.length >= 2 : type === "INVESTMENT_THESIS" ? artifact.whyThisMarket.status !== "UNKNOWN" && artifact.companies.length >= 3 : true;
  const eligible = facts.length >= minimumFacts && interpretations.length > 0 && structuralDepth;
  return {
    type, modelVersion: artifact.model.version, facts: facts.map((item) => item.statement), interpretation: interpretations.map((item) => item.statement).join(" "), hypothesis: hypotheses[0]?.statement ?? null, unknowns: artifact.unknowns, sourceEvidenceIds: [...new Set([...facts, ...interpretations, ...hypotheses].flatMap((item) => item.evidenceIds))], eligible, reason: eligible ? null : "INSUFFICIENT_EVIDENCE_DEPTH",
  };
}
