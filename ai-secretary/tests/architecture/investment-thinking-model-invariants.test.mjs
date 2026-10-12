import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("investment thinking model reuses IntelligenceToday and creates no second store", () => {
  const store = read("app/lib/investing/intelligence/store.ts");
  const types = read("app/lib/investing/intelligence/types.ts");
  assert.match(types, /researchArtifact/);
  assert.match(store, /intelligence-today\.json/);
  assert.doesNotMatch(store, /thinking-model\.json|thinking-research\.json/);
});

test("X investment projection is read-only and has no mutation dependency", () => {
  const projection = read("app/lib/note/investing/researchProjection.ts");
  assert.match(projection, /Read-only projection/);
  assert.doesNotMatch(projection, /from ["'][^"']*(?:store|provider|gateway|publisher|scheduler)[^"']*["']/i);
  assert.doesNotMatch(projection, /\b(?:save|upsert|append|publish|schedule|approve|tradeExecutor)\s*\(/);
});

test("thinking model keeps final investment actions human-only", () => {
  const model = read("app/lib/investing/intelligence/thinkingModel.ts");
  assert.match(model, /Buy\/Sell[\s\S]*HUMAN_ONLY/);
  assert.doesNotMatch(model, /executeTrade|placeOrder|positionSize\s*:/);
});

test("investment feedback produces only a non-executable candidate", () => {
  const candidates = read("app/lib/company/evolution/skillCandidates.ts");
  assert.match(candidates, /deriveInvestmentThinkingSkillCandidatesFromFeedback/);
  assert.match(candidates, /departmentId !== "fund"/);
  assert.match(candidates, /Approval records intent only/);
  assert.match(candidates, /executable: false[\s\S]*engineeringRequestAllowed: false[\s\S]*registryMutationAllowed: false/);
});
