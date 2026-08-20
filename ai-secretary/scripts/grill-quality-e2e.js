/* Grilling 品質テスト + 5シナリオBenchmark（構造テスト。LLM出力の固定文字列assertはしない） */
const fs = require("fs");
const path = require("path");

const DIST = process.env.GRILL_E2E_DIST || "/tmp/grill-e2e-dist";
const ORCH = require(path.join(DIST, "grill/orchestrator.js"));
const ARCH = require(path.join(DIST, "grill/archetypes.js"));
const VAL = require(path.join(DIST, "grill/validate.js"));
const DEC = require(path.join(DIST, "grill/decisions.js"));
const QS = require(path.join(DIST, "grill/questions.js"));
const TYPES = require(path.join(DIST, "grill/types.js"));
const FACTS = require(path.join(DIST, "grill/facts.js"));

const VAULT = process.env.VAULT_ROOT;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m); } };

const node = (id, deps, extra = {}) => ({
  id, title: id, question: `${id}について、AとBのどちらを採用しますか。`, dependsOn: deps,
  status: "blocked", recommendation: "A案", recommendationReason: "理由", children: [], ...extra,
});

(async () => {
  console.log("\n[Q1] topic別Design Tree（汎用Treeへ退化しない）");
  ok(ARCH.detectArchetype("HP制作商談の受注率を上げたい") === "sales", "営業topic → sales archetype");
  ok(ARCH.detectArchetype("新しいタスク管理システムを設計したい") === "software", "設計topic → software archetype");
  ok(ARCH.detectArchetype("AI受託事業の営業モデルを設計したい") !== "generic", "事業topic → 専用archetype");
  ok(ARCH.detectArchetype("個別株の売買ルールを決めたい") === "investment", "投資topic → investment archetype");
  ok(ARCH.detectArchetype("仕事の時間管理ルールを作りたい") === "productivity", "時間管理topic → productivity archetype");
  const salesTree = ARCH.archetypeTree("sales");
  const swTree = ARCH.archetypeTree("software");
  const salesTitles = salesTree.map((n) => n.title).join(",");
  const swTitles = swTree.map((n) => n.title).join(",");
  ok(salesTitles !== swTitles, "topicが違えばTree構造が変わる");
  ok(!/^目的,対象,方法/.test(salesTitles), "汎用的な『目的/対象/方法』Treeになっていない");

  console.log("\n[Q2] Question Quality Gate（破損Treeの拒否・sanitize）");
  const dup = VAL.validateAndSanitizeTree([node("a", []), node("a", [])]);
  ok(dup.nodes.length === 2 - dup.duplicateQuestionsRemoved, "重複questionを除去する");
  ok(dup.duplicateQuestionsRemoved >= 1, "重複除去数を記録 " + dup.duplicateQuestionsRemoved);
  const noQ = VAL.validateAndSanitizeTree([{ ...node("x", []), question: "" }]);
  ok(noQ.rejected === true, "空questionのみのTreeは拒否");
  const noRec = VAL.validateAndSanitizeTree([{ ...node("y", []), recommendation: "" }]);
  ok(noRec.rejected === true, "推奨なしのみのTreeは拒否");
  const selfDep = VAL.validateAndSanitizeTree([node("z", ["z"])]);
  ok(selfDep.nodes[0].dependsOn.length === 0, "自己依存を除去");
  const badDep = VAL.validateAndSanitizeTree([node("m", ["nope"])]);
  ok(badDep.nodes[0].dependsOn.length === 0, "存在しないdependsOnを除去");
  const cyc = VAL.validateAndSanitizeTree([node("c1", ["c2"]), node("c2", ["c1"])]);
  ok(cyc.warnings.some((w) => /循環/.test(w)), "循環依存を検出して警告");
  const shortQ = VAL.validateAndSanitizeTree([{ ...node("s", []), question: "短い" }]);
  ok(shortQ.warnings.some((w) => /短すぎ/.test(w)), "短すぎる質問を警告");
  const noReason = VAL.validateAndSanitizeTree([{ ...node("r", []), recommendationReason: "" }]);
  ok(noReason.warnings.some((w) => /推奨理由/.test(w)), "推奨理由が空を警告");
  const badOpt = VAL.validateAndSanitizeTree([{ ...node("o", []), options: [{ index: 1, label: "A", description: "", isRecommended: false }] }]);
  ok(badOpt.warnings.some((w) => /推奨案が未指定/.test(w)), "選択肢はあるが推奨案なしを警告");
  ok(VAL.questionFingerprint("これはテストですか？") === VAL.questionFingerprint("これはテスト"), "表記ゆれを吸収した指紋比較");

  console.log("\n[Q3] 回答済み質問の再出題を防ぐ");
  const answered = ["Aについて、どちらを採用しますか。"];
  const again = VAL.validateAndSanitizeTree([{ ...node("dup2", []), question: "Aについて、どちらを採用しますか。" }], [], answered);
  ok(again.nodes.length === 0, "既回答と同じ質問は除去される");
  ok(again.duplicateQuestionsRemoved === 1, "重複としてカウントされる");

  console.log("\n[Q4] 全Nodeに推奨と理由が存在する（archetype）");
  for (const a of ["sales", "software", "business", "investment", "productivity", "generic"]) {
    const t = ARCH.archetypeTree(a);
    const allRec = t.every((n) => n.recommendation && n.recommendation.length > 0);
    const allReason = t.every((n) => n.recommendationReason && n.recommendationReason.length > 10);
    const allOpts = t.every((n) => Array.isArray(n.options) && n.options.length >= 2);
    const oneRec = t.every((n) => n.options.filter((o) => o.isRecommended).length === 1);
    ok(allRec && allReason && allOpts && oneRec, `${a}: 全Nodeに選択肢・推奨・理由がある (${t.length}論点)`);
  }

  console.log("\n[Q5] maxQuestionsPerRound と Frontier の分離");
  ok(TYPES.MAX_QUESTIONS_PER_ROUND >= 3 && TYPES.MAX_QUESTIONS_PER_ROUND <= 5, "上限は3〜5問 (" + TYPES.MAX_QUESTIONS_PER_ROUND + ")");
  const wide = {
    id: "w", topic: "t", status: "active",
    designTree: [node("f1", []), node("f2", []), node("f3", []), node("f4", []), node("f5", []), node("f6", [])],
    answers: {}, currentFrontier: ["f1", "f2", "f3", "f4", "f5", "f6"], round: 1, facts: [],
    secretaryId: "executive-assistant", durability: "durable", createdAt: "x", updatedAt: "x",
  };
  const visible = ORCH.selectVisibleQuestions(wide);
  ok(visible.length === TYPES.MAX_QUESTIONS_PER_ROUND, `表示は${TYPES.MAX_QUESTIONS_PER_ROUND}問に制限 (${visible.length})`);
  ok(wide.currentFrontier.length === 6, "currentFrontierは6件のまま維持（依存関係を壊さない）");

  console.log("\n[Q6] Rejected Alternatives をSessionの実データから作る");
  const answeredNode = {
    ...node("d1", []), status: "answered", answer: "A案",
    options: [
      { index: 1, label: "A案", description: "推奨", isRecommended: true },
      { index: 2, label: "B案", description: "別案の説明", isRecommended: false },
    ],
  };
  const rej = DEC.deriveRejectedAlternatives({ designTree: [answeredNode] });
  ok(rej.length === 1 && /B案/.test(rej[0].alternative), "選ばれなかった案を抽出");
  ok(/明示的な理由なし/.test(rej[0].reason), "理由未明示は捏造せず明示（" + rej[0].reason.slice(0, 30) + "）");
  ok(rej[0].source === "not_chosen", "却下の種別を記録");
  const wd = DEC.buildWithdrawnAlternative(answeredNode, "旧決定");
  ok(wd.source === "withdrawn" && /撤回/.test(wd.reason), "再Grillで撤回された旧決定を表現できる");

  console.log("\n[Q7] Shared Understanding 必須セクション");
  const sess = {
    id: "su", topic: "テスト設計", status: "ready_for_confirmation",
    designTree: [answeredNode], answers: { d1: "A案" }, currentFrontier: [], round: 2,
    facts: [], secretaryId: "executive-assistant", durability: "durable", createdAt: "x", updatedAt: "x",
  };
  const su = await QS.generateSharedUnderstanding(sess, rej);
  for (const k of ["summary", "majorDecisions", "rejectedAlternatives", "risks", "remainingAssumptions", "implementationScope"]) {
    ok(su[k] !== undefined, `必須セクション ${k} が存在`);
  }
  ok(su.rejectedAlternatives.length === 1, "却下案はSession由来の1件（LLMの想像で増やさない）");
  const md = QS.sharedUnderstandingToMarkdown(sess, su);
  for (const h of ["## Summary", "## Major Decisions", "## Rejected Alternatives", "## Risks", "## Remaining Assumptions", "## Implementation Scope", "## Non-Goals", "## Constraints", "## Acceptance Criteria"]) {
    ok(md.includes(h), `Markdownに ${h} がある`);
  }

  console.log("\n[Q8] Quality Metadata");
  const v = await ORCH.startGrilling({ topic: "HP制作商談の受注率を上げたい" });
  const q = v.session.quality;
  ok(!!q, "qualityが記録される");
  ok(q.designTreeSource === "llm" || q.designTreeSource === "fallback", "designTreeSource: " + q.designTreeSource);
  ok(typeof q.fallbackUsed === "boolean", "fallbackUsed: " + q.fallbackUsed);
  ok(Array.isArray(q.providerIds) && q.providerIds.length > 0, "providerIds: " + q.providerIds.join("/"));
  ok(q.generatedNodeCount > 0, "generatedNodeCount: " + q.generatedNodeCount);
  ok(typeof q.duplicateQuestionsRemoved === "number", "duplicateQuestionsRemoved記録");
  ok(Array.isArray(q.validationWarnings), "validationWarnings記録");

  console.log("\n[Q9] フィードバックはKnowledgeに入らない");
  const inboxDir = path.join(VAULT, "memory/personal/inbox");
  const beforeFb = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md")).length : 0;
  const fb = await ORCH.submitGrillFeedback({ sessionId: v.session.id, rating: "good", comment: "質問が的確だった" });
  ok(fb.session.feedback.rating === "good", "フィードバックがSessionに保存される");
  ok(fb.session.feedback.comment === "質問が的確だった", "自由記述も保存される");
  const afterFb = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md")).length : 0;
  ok(beforeFb === afterFb, "フィードバックではInbox（Knowledge候補）が増えない");
  const kdir = path.join(VAULT, "memory/knowledge");
  const kn = fs.existsSync(kdir) ? fs.readdirSync(kdir).flatMap((d) => { const p = path.join(kdir, d); return fs.statSync(p).isDirectory() ? fs.readdirSync(p) : []; }) : [];
  ok(kn.length === 0, "正式Knowledgeにも入らない");

  console.log("\n[Q10] Supabase未設定・Redis未設定でも全機能動作");
  ok(!process.env.UPSTASH_REDIS_REST_URL, "Redis未設定の環境で実行されている");
  ok(v.session.id && fb.session.id === v.session.id, "未設定でもセッションの保存・読み出しが動く");

  console.log("\n========== Benchmark: 5シナリオ ==========");
  const scenarios = [
    ["A 営業", "HP制作商談の受注率を上げたい"],
    ["B Software", "新しいタスク管理システムを設計したい"],
    ["C Business", "AI受託事業の営業モデルを設計したい"],
    ["D Investment", "個別株の売買ルールを決めたい"],
    ["E Productivity", "仕事の時間管理ルールを作りたい"],
  ];
  const seenTitleSets = [];
  for (const [name, topic] of scenarios) {
    console.log(`\n[${name}] ${topic}`);
    const view = await ORCH.startGrilling({ topic });
    const sn = view.session;
    ok(sn.designTree.length >= 3, `Treeが生成される (${sn.designTree.length}論点)`);
    ok(sn.quality.designTreeSource === "llm" || sn.quality.fallbackUsed === true, `fallback有無を記録: source=${sn.quality.designTreeSource}`);
    ok(sn.designTree.every((n) => n.recommendation), "全Nodeに推奨がある");
    ok(sn.designTree.every((n) => n.recommendationReason), "全Nodeに推奨理由がある");
    const ids = new Set(sn.designTree.map((n) => n.id));
    ok(sn.designTree.every((n) => n.dependsOn.every((d) => ids.has(d))), "dependsOnがvalid");
    ok(sn.currentFrontier.length > 0, `Frontierが成立 (${sn.currentFrontier.length}件)`);
    ok(view.visibleQuestions.length <= TYPES.MAX_QUESTIONS_PER_ROUND, `表示質問は上限以内 (${view.visibleQuestions.length})`);
    const fps = sn.designTree.map((n) => VAL.questionFingerprint(n.question));
    ok(new Set(fps).size === fps.length, "重複Questionが無い");
    ok(sn.quality.providerIds.length > 0, `Provider選択: ${sn.quality.providerIds.join("/")}`);
    seenTitleSets.push(sn.designTree.map((n) => n.title).join("|"));
  }
  ok(new Set(seenTitleSets).size === scenarios.length, "5シナリオすべてTree構造が異なる（topic固有）");

  console.log("\n==========================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
