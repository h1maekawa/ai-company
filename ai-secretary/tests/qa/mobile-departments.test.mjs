import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildDepartmentReadModel, draftDirective, DIRECTIVE_ROUTING, isDepartmentDirective, routeCreatorDirective } = require(path.join(process.env.QA_DIST, "out/app/lib/mobile-ceo/departments.js"));

test("Creator KPIは正式RPM fieldとContent snapshot asOfを保持する", () => {
  const model = buildDepartmentReadModel("creator", { economics:{outcome:{revenueYen:100000,costYen:20000,profitYen:80000,roi:4,revenueStatus:"CONFIRMED",costStatus:"CONFIRMED"}}, content:{publishedCount:4,conversions:2,revenuePerThousandImpressions:999,dataAsOf:"2026-09-20T12:00:00Z",derived:{revenuePer1000Impressions:1250}} }, "2026-09-21T00:00:00Z");
  assert.equal(model.northStar.value, 80000);
  assert.equal(model.outcomes.find(x=>x.metric==="revenue_per_content").value,25000);
  assert.equal(model.operations.find(x=>x.metric==="rpm").value,1250);
  assert.equal(model.operations.find(x=>x.metric==="rpm").asOf,"2026-09-20T12:00:00Z");
  assert.equal(model.northStar.asOf,undefined, "生成時刻をSSOTの観測時刻として捏造しない");
});

test("UNKNOWNは0へ変換しない", () => { const model=buildDepartmentReadModel("creator",{economics:{outcome:{revenueStatus:"UNKNOWN",costStatus:"UNKNOWN"}},content:{}}); assert.equal(model.northStar.value,null); assert.equal(model.northStar.availability,"UNKNOWN"); });

test("Fund KPIはdecisionを使用しWAIT_DATAをProblemとして検出する", () => {
  const model=buildDepartmentReadModel("fund",{recommendations:{recommendations:[{id:"r1",ticker:"ASML",decision:"WAIT_DATA",action:"BUY_CANDIDATE",executionBlocked:false,dataAsOf:"2026-09-20T10:00:00Z"}]},decisions:{decisions:[]},transactions:{transactions:[]},learning:{learnings:[]}});
  assert.deepEqual(model.currentWork,["ASML: WAIT_DATA"]);
  assert.deepEqual(model.problems,["ASML: WAIT_DATA"]);
  assert.equal(model.operations.find(x=>x.metric==="decision_required").value,1);
  assert.equal(model.operations.find(x=>x.metric==="recommendations").asOf,"2026-09-20T10:00:00Z");
  assert.equal(model.executionAuthority,"HUMAN_ONLY"); assert.equal(model.aiExecutionAllowed,false);
});

test("Fund Portfolio KPIは既存Portfolio SSOTの実値とasOfだけを使う", () => {
  const portfolio={source:"holdings_csv",updatedAt:"2026-09-19T00:00:00Z",revaluedAt:"2026-09-20T00:00:00Z",positions:[{marketValueJpy:600000},{marketValueJpy:400000}],summary:{totalValueJpy:1000000,allocation:[{pct:70}]}};
  const model=buildDepartmentReadModel("fund",{recommendations:{recommendations:[]},portfolio,transactions:{transactions:[]},learning:{learnings:[]}});
  assert.equal(model.outcomes.find(x=>x.metric==="portfolio_value").value,1000000);
  assert.equal(model.operations.find(x=>x.metric==="allocation").value,70);
  assert.equal(model.operations.find(x=>x.metric==="concentration").value,60);
  assert.equal(model.operations.find(x=>x.metric==="concentration").asOf,"2026-09-20T00:00:00Z");
});

test("Fund Portfolio取得不能はUNKNOWNであり0ではない", () => { const model=buildDepartmentReadModel("fund",{recommendations:{recommendations:[]},transactions:{transactions:[]},learning:{learnings:[]}}); const value=model.outcomes.find(x=>x.metric==="portfolio_value"); assert.equal(value.value,null); assert.equal(value.availability,"UNKNOWN"); });

test("Operations KPIは不足データをPARTIALにする", () => { const model=buildDepartmentReadModel("operations",{metrics:{automationRate:80,sufficientData:false},execution:{state:{missions:[]}}}); assert.equal(model.northStar.value,80); assert.equal(model.northStar.availability,"PARTIAL"); });

test("Engineering取得不能はWorker UNKNOWN", () => { const model=buildDepartmentReadModel("engineering",{engineering:{available:false,items:null}}); assert.equal(model.northStar.value,null); assert.equal(model.northStar.availability,"UNKNOWN"); });

test("Engineering GitHub summaryはPR/CI/status/Last Activityへ写像する", () => { const at="2026-09-20T08:00:00Z"; const model=buildDepartmentReadModel("engineering",{engineering:{available:true,items:[{title:"blocked",status:"BLOCKED"}],summary:{queued:2,running:1,blocked:1,prReady:3,ciSuccess:4,ciFailure:1,lastActivity:at}}}); assert.equal(model.operations.find(x=>x.metric==="queued").value,2); assert.equal(model.operations.find(x=>x.metric==="running").value,1); assert.equal(model.outcomes.find(x=>x.metric==="pr_ready").value,3); assert.equal(model.outcomes.find(x=>x.metric==="ci_success").value,4); assert.equal(model.outcomes.find(x=>x.metric==="ci_failure").value,1); assert.equal(model.operations.find(x=>x.metric==="last_activity").displayValue,at); assert.equal(model.operations.find(x=>x.metric==="last_activity").asOf,at); assert.deepEqual(model.problems,["blocked"]); });

test("DirectiveはDraftであり入力だけでは承認・実行されない", () => { const d=draftDirective({department:"creator",instruction:"記事を優先",priority:"A"}); assert.equal(d.status,"DRAFT"); assert.equal(d.approvedByHuman,false); assert.equal(d.interpretation.label,"AI interpretation"); });

test("Fund DirectiveはResearchのみ、Engineeringは外部ActionとしてPreview", () => { const fund=draftDirective({department:"fund",instruction:"ASMLを分析"}); const engineering=draftDirective({department:"engineering",instruction:"画面を追加"}); assert.equal(fund.interpretation.suggestedMissionType,"FUND_RESEARCH"); assert.equal(fund.interpretation.externalAction,false); assert.equal(engineering.interpretation.suggestedMissionType,"ENGINEERING_REQUEST"); assert.equal(engineering.interpretation.externalAction,true); });

test("Directive Routingは既存Agent context別でFund tradeとCreator publishを許可しない", () => { assert.equal(DIRECTIVE_ROUTING.creator.requiredAgentId,"personal-note"); assert.equal(DIRECTIVE_ROUTING.fund.requiredAgentId,"personal-fund"); assert.equal(DIRECTIVE_ROUTING.operations.requiredAgentId,"executive-kaizen"); assert.equal(DIRECTIVE_ROUTING.knowledge.requiredAgentId,"executive-inbox"); assert.equal(DIRECTIVE_ROUTING.planning.requiredAgentId,"personal-morning"); assert.ok(DIRECTIVE_ROUTING.fund.constraints.includes("RESEARCH_ANALYSIS_ONLY")); assert.ok(DIRECTIVE_ROUTING.fund.constraints.includes("INVESTMENT_TRADE_R4")); assert.ok(DIRECTIVE_ROUTING.creator.constraints.includes("EXTERNAL_PUBLISH_REQUIRES_SEPARATE_HUMAN_APPROVAL")); });

test("Creator Directiveは調査・下書き・KPIへ決定論的にroutingし曖昧ならLeadへ戻す", () => {
  assert.equal(routeCreatorDirective("競合と市場を調査して").requiredAgentId, "creator-research");
  assert.equal(routeCreatorDirective("note記事の下書きを作って").requiredAgentId, "creator-content");
  assert.equal(routeCreatorDirective("今月のKPIとROIを分析して").requiredAgentId, "creator-kpi");
  assert.equal(routeCreatorDirective("次の仕事を進めて").requiredAgentId, "personal-note");
  assert.ok(routeCreatorDirective("投稿案を作って").constraints.includes("EXTERNAL_PUBLISH_REQUIRES_SEPARATE_HUMAN_APPROVAL"));
});

test("Departmentの質問はDirectiveではなく、実行依頼だけが確認へ進む", () => { assert.equal(isDepartmentDirective("今のXどう？"),false); assert.equal(isDepartmentDirective("最近伸びたテーマを教えて"),false); assert.equal(isDepartmentDirective("そのテーマで3投稿作って"),true); assert.equal(isDepartmentDirective("MUを買って"),true); assert.equal(isDepartmentDirective("このバグを実装して"),true); });
