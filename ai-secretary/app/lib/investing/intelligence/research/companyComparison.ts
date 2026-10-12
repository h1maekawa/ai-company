import { THEME_UNIVERSE } from "../themes";
import type { FundamentalSnapshot, InvestmentOpportunity } from "../types";
import { marketStructureRoleOf } from "./marketStructure";
import type { CandidateCompanyShortlistEntry, CompanyComparisonArtifact, CompanyComparisonRow } from "./types";

const FIELD_LABELS: Record<string, string> = {
  revenueGrowth: "Revenue Growth",
  epsGrowth: "EPS Growth",
  grossMargin: "Gross Margin",
  operatingMargin: "Operating Margin",
  fcf: "FCF",
  roic: "ROIC",
  per: "PER",
  forwardPer: "Forward PER",
  pbr: "PBR",
  moat: "Moat",
};

function roleOf(themes: string[]): CompanyComparisonRow["marketRole"] {
  for (const theme of themes) {
    const definition = THEME_UNIVERSE.find((item) => item.name === theme);
    if (!definition) continue;
    const role = marketStructureRoleOf(definition.id);
    if (role) return role;
  }
  return null;
}

/**
 * Builds one comparison row per shortlisted company. Reuses the existing FundamentalSnapshot
 * (app/lib/investing/intelligence/providers/sec.ts) and InvestmentOpportunity.riskFlags; adds no
 * new fundamentals provider or risk store. `grossMargin` and `forwardPer` are always null: the
 * existing SEC parser does not derive COGS or forward estimates yet (documented gap, not a
 * synthesized value). `moat` is always null in PR-B: it requires qualitative research judgment
 * this PR does not invent.
 */
export function buildCompanyComparisonRows(
  theme: string,
  shortlist: CandidateCompanyShortlistEntry[],
  fundamentals: Map<string, FundamentalSnapshot>,
  opportunities: InvestmentOpportunity[],
  now = new Date()
): CompanyComparisonArtifact {
  const rows = shortlist.map((entry): CompanyComparisonRow => {
    const fundamental = fundamentals.get(entry.ticker);
    const usable = fundamental && fundamental.sourceUrl && !["stale", "unknown"].includes(fundamental.freshness) ? fundamental : undefined;
    const opportunity = opportunities.find((item) => item.ticker === entry.ticker);

    const row: Omit<CompanyComparisonRow, "criticalRisks" | "warningRisks" | "evidenceRefs" | "missingData"> = {
      ticker: entry.ticker,
      name: entry.name,
      marketRole: roleOf(entry.themes),
      themeExposure: entry.themes,
      causalDistance: entry.causalDistance,
      revenueGrowth: usable?.revenueGrowth ?? null,
      epsGrowth: usable?.epsGrowth ?? null,
      grossMargin: null,
      operatingMargin: usable?.operatingMargin ?? null,
      fcf: usable?.fcf ?? null,
      roic: usable?.roic ?? null,
      per: usable?.per ?? null,
      forwardPer: null,
      pbr: usable?.pbr ?? null,
      moat: null,
    };

    const criticalRisks = (opportunity?.riskFlags ?? []).filter((flag) => flag.severity === "critical").map((flag) => flag.detail);
    const warningRisks = (opportunity?.riskFlags ?? []).filter((flag) => flag.severity === "warning").map((flag) => flag.detail);
    const evidenceRefs = (opportunity?.evidence ?? []).filter((item) => item.sourceType === "research" && item.sourceUrl).map((item) => item.id);
    const missingData = (Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).filter((key) => (row as unknown as Record<string, unknown>)[key] === null).map((key) => FIELD_LABELS[key]);

    return { ...row, criticalRisks, warningRisks, evidenceRefs, missingData };
  });

  return {
    theme,
    rows,
    singleCompanyException: rows.length < 3,
    generatedAt: now.toISOString(),
  };
}
