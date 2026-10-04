export const INVESTMENT_INTELLIGENCE_CONFIG = {
  minimumAdtvUsd: 1_000_000,
  minimumImpactConfidence: 0.7,
  minimumOpportunityCoverage: 0.8,
  minimumHotThemeScore: 70,
  minimumHotThemeCoverage: 0.6,
  maxThemeGraphCandidates: 10,
  themeScoreWeights: { newsMomentum: 20, futureDemand: 20, catalyst: 15, sectorStrength: 15, tickerMomentum: 10, relativeVolume: 10, sourceDiversity: 10 },
} as const;
