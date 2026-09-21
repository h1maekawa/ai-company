import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildDepartmentReadModel, draftDirective } = require(path.join(process.env.QA_DIST, "out/app/lib/mobile-ceo/departments.js"));

test("Creator KPIはRevenue/Cost SSOTを集約しsource/asOfを持つ", () => {
  const model = buildDepartmentReadModel("creator", { economics:{outcome:{revenueYen:100000,costYen:20000,profitYen:80000,roi:4,revenueStatus:"CONFIRMED",costStatus:"CONFIRMED"}}, content:{publishedCount:4,conversions:2} }, "2026-09-21T00:00:00Z");
  assert.equal(model.northStar.value, 80000); assert.equal(model.outcomes.find(x=>x.metric==="revenue_per_content").value,25000); assert.ok(model.northStar.source); assert.equal(model.northStar.asOf,"2026-09-21T00:00:00Z");
});

test("UNKNOWNは0へ変換しない", () => { const model=buildDepartmentReadModel("creator",{economics:{outcome:{revenueStatus:"UNKNOWN",costStatus:"UNKNOWN"}},content:{}}); assert.equal(model.northStar.value,null); assert.equal(model.northStar.availability,"UNKNOWN"); });

test("Fund KPIはHuman OnlyでDecision Requiredを集約する", () => { const model=buildDepartmentReadModel("fund",{recommendations:{recommendations:[{id:"r1",action:"BUY_CANDIDATE"}]},decisions:{decisions:[]},transactions:{transactions:[]},learning:{learnings:[]}}); assert.equal(model.operations.find(x=>x.metric==="decision_required").value,1); assert.equal(model.executionAuthority,"HUMAN_ONLY"); assert.equal(model.aiExecutionAllowed,false); });

test("Operations KPIは不足データをPARTIALにする", () => { const model=buildDepartmentReadModel("operations",{metrics:{automationRate:80,sufficientData:false},execution:{state:{missions:[]}}}); assert.equal(model.northStar.value,80); assert.equal(model.northStar.availability,"PARTIAL"); });

test("Engineering取得不能はWorker UNKNOWN", () => { const model=buildDepartmentReadModel("engineering",{engineering:{available:false,items:null}}); assert.equal(model.northStar.value,null); assert.equal(model.northStar.availability,"UNKNOWN"); });

test("DirectiveはDraftであり入力だけでは承認・実行されない", () => { const d=draftDirective({department:"creator",instruction:"記事を優先",priority:"A"}); assert.equal(d.status,"DRAFT"); assert.equal(d.approvedByHuman,false); assert.equal(d.interpretation.label,"AI interpretation"); });

test("Fund DirectiveはResearchのみ、Engineeringは外部ActionとしてPreview", () => { const fund=draftDirective({department:"fund",instruction:"ASMLを分析"}); const engineering=draftDirective({department:"engineering",instruction:"画面を追加"}); assert.equal(fund.interpretation.suggestedMissionType,"FUND_RESEARCH"); assert.equal(fund.interpretation.externalAction,false); assert.equal(engineering.interpretation.suggestedMissionType,"ENGINEERING_REQUEST"); assert.equal(engineering.interpretation.externalAction,true); });
