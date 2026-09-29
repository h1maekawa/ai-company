export function investmentIntelligenceEnabled(): boolean {
  return process.env.INVESTING_INTELLIGENCE_ENABLED === "true";
}
