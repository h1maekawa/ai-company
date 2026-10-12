export type ReadinessProviderName = "Yahoo" | "FRED" | "SEC" | "SerpAPI";
export type ReadinessProviderState = "OK" | "NOT_CONFIGURED" | "ERROR" | "SKIPPED";
export type FeatureFlagState = "ENABLED" | "DISABLED" | "NOT_CONFIGURED";

export type RecordedProviderEvidence = {
  provider: string;
  status: ReadinessProviderState;
  checkedAt: string;
};

export type ReadinessInput = {
  generatedAt: string;
  environment: {
    investmentIntelligenceFlag: string | undefined;
    fredApiKeyConfigured: boolean;
    secUserAgentConfigured: boolean;
    serpApiEnabled: boolean;
    serpApiKeyConfigured: boolean;
  };
  providerEvidence: RecordedProviderEvidence[];
  portfolio: {
    available: boolean;
    positionCount: number;
    source: string;
    updatedAt: string | null;
  };
  watchlist: {
    themeCount: number;
    itemCount: number;
    updatedAt: string | null;
  };
};

export type InvestmentPhase2Readiness = {
  generatedAt: string;
  mode: "READ_ONLY";
  productionMutationPerformed: false;
  featureFlag: {
    name: "INVESTING_INTELLIGENCE_ENABLED";
    status: FeatureFlagState;
    requiresHumanGate: true;
  };
  providers: Array<{
    provider: ReadinessProviderName;
    status: ReadinessProviderState;
    configuration: "CONFIGURED" | "NOT_CONFIGURED" | "NO_SECRET_REQUIRED";
    checkedAt: string | null;
    evidence: "RECORDED_CHECK" | "CONFIGURATION_ONLY";
  }>;
  portfolio: ReadinessInput["portfolio"];
  watchlist: ReadinessInput["watchlist"] & { available: boolean };
  blockers: string[];
};

function latestEvidence(provider: ReadinessProviderName, rows: RecordedProviderEvidence[]) {
  return rows
    .filter((row) => row.provider === provider)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0] ?? null;
}

export function deriveInvestmentPhase2Readiness(input: ReadinessInput): InvestmentPhase2Readiness {
  const flagStatus: FeatureFlagState = input.environment.investmentIntelligenceFlag === undefined
    ? "NOT_CONFIGURED"
    : input.environment.investmentIntelligenceFlag === "true"
      ? "ENABLED"
      : "DISABLED";

  const configurations: Record<ReadinessProviderName, boolean | "NO_SECRET_REQUIRED"> = {
    Yahoo: "NO_SECRET_REQUIRED",
    FRED: input.environment.fredApiKeyConfigured,
    SEC: input.environment.secUserAgentConfigured,
    SerpAPI: input.environment.serpApiEnabled && input.environment.serpApiKeyConfigured,
  };

  const providers = (["Yahoo", "FRED", "SEC", "SerpAPI"] as const).map((provider) => {
    const configured = configurations[provider];
    const recorded = latestEvidence(provider, input.providerEvidence);
    const configuration = configured === "NO_SECRET_REQUIRED"
      ? "NO_SECRET_REQUIRED" as const
      : configured
        ? "CONFIGURED" as const
        : "NOT_CONFIGURED" as const;
    if (configured !== "NO_SECRET_REQUIRED" && !configured) {
      return { provider, status: "NOT_CONFIGURED" as const, configuration, checkedAt: null, evidence: "CONFIGURATION_ONLY" as const };
    }
    return {
      provider,
      status: recorded?.status ?? "SKIPPED",
      configuration,
      checkedAt: recorded?.checkedAt ?? null,
      evidence: recorded ? "RECORDED_CHECK" as const : "CONFIGURATION_ONLY" as const,
    };
  });

  const blockers: string[] = [];
  if (flagStatus !== "ENABLED") blockers.push(`FEATURE_FLAG_${flagStatus}`);
  for (const provider of providers) {
    if (provider.status !== "OK") blockers.push(`${provider.provider.toUpperCase()}_${provider.status}`);
  }
  if (!input.portfolio.available) blockers.push("PORTFOLIO_UNAVAILABLE");
  if (input.watchlist.itemCount === 0) blockers.push("WATCHLIST_UNAVAILABLE");

  return {
    generatedAt: input.generatedAt,
    mode: "READ_ONLY",
    productionMutationPerformed: false,
    featureFlag: {
      name: "INVESTING_INTELLIGENCE_ENABLED",
      status: flagStatus,
      requiresHumanGate: true,
    },
    providers,
    portfolio: input.portfolio,
    watchlist: { ...input.watchlist, available: input.watchlist.itemCount > 0 },
    blockers,
  };
}
