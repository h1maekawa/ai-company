import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

const RESEARCH_FILES = [
  "app/lib/investing/intelligence/research/types.ts",
  "app/lib/investing/intelligence/research/marketHypothesis.ts",
  "app/lib/investing/intelligence/research/marketStructure.ts",
  "app/lib/investing/intelligence/research/picksAndShovels.ts",
  "app/lib/investing/intelligence/research/bottleneck.ts",
  "app/lib/investing/intelligence/research/causalDistance.ts",
  "app/lib/investing/intelligence/research/candidateDiscovery.ts",
  "app/lib/investing/intelligence/research/companyComparison.ts",
  "app/lib/investing/intelligence/research/orchestrator.ts",
];

test("No X Dependency: Investment Research Structure never imports note/X/content modules", () => {
  for (const path of RESEARCH_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /from\s+["'].*\/(note|content|instagram)\//, `${path} must not import note/content/instagram modules`);
    assert.doesNotMatch(source, /xBridge|learningBrief|researchProjection|Buffer|DailyX/, `${path} must not reference the X/note bridge`);
  }
});

test("Human Gate: no research module describes a trade/order/broker execution path", () => {
  for (const path of RESEARCH_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /placeOrder|autoBuy|autoSell|broker\.execute|executeTrade/i, `${path} must not describe an execution path`);
  }
});

test("Research Structure types reuse existing Investment Intelligence types rather than duplicating them", () => {
  const types = read("app/lib/investing/intelligence/research/types.ts");
  assert.match(types, /from\s+["']\.\.\/types["']/, "research/types.ts must import from the existing app/lib/investing/intelligence/types.ts");
  assert.doesNotMatch(types, /type\s+InvestmentEvidence\s*=\s*\{/, "must not redefine InvestmentEvidence");
  assert.doesNotMatch(types, /type\s+InvestmentOpportunity\s*=\s*\{/, "must not redefine InvestmentOpportunity");
});

test("backward compatibility: IntelligenceToday keeps every existing field and adds research as optional", () => {
  const types = read("app/lib/investing/intelligence/types.ts");
  for (const field of ["asOf:", "marketRegime:", "opportunities:", "portfolioAlerts:", "providerStatus:", "themeStrength:", "summary:"]) {
    assert.match(types, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `IntelligenceToday must keep existing field ${field}`);
  }
  assert.match(types, /research\?:\s*import\(".\/research\/types"\)\.InvestmentResearchBundle/, "research must be an additive optional field");
});

test("runDailyInvestmentResearch never lets Research Structure failure break the existing daily artifact", () => {
  const source = read("app/lib/investing/intelligence/research.ts");
  assert.match(source, /try\s*\{[\s\S]*buildInvestmentResearchBundle[\s\S]*\}\s*catch/, "research bundle construction must be wrapped in try/catch");
});

test("Production/Secrets/env/Cron surfaces are untouched by the Research Structure change", () => {
  for (const path of ["app/lib/investing/intelligence/cron.ts", "app/lib/investing/intelligence/flags.ts", "vercel.json"]) {
    const source = read(path);
    assert.doesNotMatch(source, /research\/orchestrator|InvestmentResearchBundle/, `${path} must not reference the new Research Structure module`);
  }
});
