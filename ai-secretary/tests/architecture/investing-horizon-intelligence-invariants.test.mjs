import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

const HORIZON_FILES = [
  "app/lib/investing/intelligence/horizon/types.ts",
  "app/lib/investing/intelligence/horizon/shared.ts",
  "app/lib/investing/intelligence/horizon/shortScore.ts",
  "app/lib/investing/intelligence/horizon/midScore.ts",
  "app/lib/investing/intelligence/horizon/longScore.ts",
  "app/lib/investing/intelligence/horizon/tripleGate.ts",
];

test("No X Dependency: Horizon Intelligence never imports note/X/content modules", () => {
  for (const path of HORIZON_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /from\s+["'].*\/(note|content|instagram)\//, `${path} must not import note/content/instagram modules`);
    assert.doesNotMatch(source, /xBridge|learningBrief|researchProjection|Buffer|DailyX/, `${path} must not reference the X/note bridge`);
  }
});

test("Human Gate: Horizon Intelligence only ever outputs GO_CANDIDATE/WAIT/PASS/DATA_INCOMPLETE, never a trade action", () => {
  for (const path of HORIZON_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /placeOrder|autoBuy|autoSell|broker\.execute|executeTrade|positionSize|orderType/i, `${path} must not describe an execution path`);
  }
  const types = read("app/lib/investing/intelligence/horizon/types.ts");
  assert.match(types, /"GO_CANDIDATE"\s*\|\s*"WAIT"\s*\|\s*"PASS"\s*\|\s*"DATA_INCOMPLETE"/);
});

test("Horizon builders are pure: no network fetch, no persistence, inputs only", () => {
  for (const path of HORIZON_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /\bfetch\(|saveVaultFile|getVaultFile|saveIntelligenceToday/, `${path} must stay a pure function over already-fetched inputs`);
  }
});

test("backward compatibility: InvestmentOpportunity keeps every existing field and adds horizon fields as optional", () => {
  const types = read("app/lib/investing/intelligence/types.ts");
  for (const field of ["ticker:", "gate:", "score:", "breakdown:", "riskFlags:", "scenarios:", "evidence:"]) {
    assert.match(types, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `InvestmentOpportunity must keep existing field ${field}`);
  }
  assert.match(types, /shortTerm\?:\s*import\(".\/horizon\/types"\)\.HorizonAssessment/);
  assert.match(types, /midTerm\?:\s*import\(".\/horizon\/types"\)\.HorizonAssessment/);
  assert.match(types, /longTerm\?:\s*import\(".\/horizon\/types"\)\.HorizonAssessment/);
  assert.match(types, /tripleGate\?:\s*import\(".\/horizon\/types"\)\.TripleGate/);
});

test("runDailyInvestmentResearch never lets a single ticker's Horizon failure break its existing score/gate", () => {
  const source = read("app/lib/investing/intelligence/research.ts");
  assert.match(source, /opportunities\.map\(\(opportunity\)\s*=>\s*\{[\s\S]*try\s*\{[\s\S]*buildShortTermAssessment[\s\S]*\}\s*catch/, "per-opportunity horizon build must be wrapped in try/catch and fall back to the existing opportunity");
});

test("Production/Secrets/env/Cron surfaces are untouched by Horizon Intelligence", () => {
  for (const path of ["app/lib/investing/intelligence/cron.ts", "app/lib/investing/intelligence/flags.ts", "vercel.json"]) {
    const source = read(path);
    assert.doesNotMatch(source, /horizon\/|HorizonAssessment|TripleGate/, `${path} must not reference the new Horizon Intelligence module`);
  }
});
