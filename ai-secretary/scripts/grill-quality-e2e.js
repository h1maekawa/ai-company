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
const DT = require(path.join(DIST, "grill/designTree.js"));
const SUG = require(path.join(DIST, "grill/suGate.js"));
const BM = require(path.join(DIST, "grill/benchmarks.js"));
const GROQ = require(path.join(DIST, "ai/groq.js"));
const AIERR = require(path.join(DIST, "ai/errors.js"));

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
  const suRes = await QS.generateSharedUnderstanding(sess, rej);
  const su = suRes.su;
  ok(typeof suRes.attempts === "number" && suRes.attempts >= 1, "SU生成のattemptsを記録 (" + suRes.attempts + ")");
  ok(suRes.source === "llm" || suRes.source === "fallback", "SU段階のsourceを記録");
  if (suRes.source === "fallback") ok(!!suRes.fallbackReason, "SU fallback理由を段階別に記録");
  ok(Array.isArray(suRes.warnings), "SU Quality Gateの警告を返す (" + suRes.warnings.length + "件)");
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

  console.log("\n[Q11] frontierStats（過剰直列化の観測）");
  const serial = [node("a", []), node("b", ["a"]), node("c", ["b"]), node("d", ["c"])];
  const st1 = DT.computeFrontierStats(serial, 4);
  ok(st1.initialFrontierSize === 1, "直列Tree: initialFrontierSize=1");
  ok(st1.estimatedRounds === 4, "直列Tree: 4論点で4Round (" + st1.estimatedRounds + ")");
  ok(st1.maxDependencyDepth === 3, "直列Tree: depth=3 (" + st1.maxDependencyDepth + ")");
  const parallel = [node("a", []), node("b", []), node("c", ["a"]), node("d", ["a"])];
  const st2 = DT.computeFrontierStats(parallel, 4);
  ok(st2.initialFrontierSize === 2, "並列Tree: initialFrontierSize=2");
  ok(st2.estimatedRounds === 2, "並列Tree: 4論点で2Round (" + st2.estimatedRounds + ")");
  ok(st2.averageVisibleQuestionsPerRound > st1.averageVisibleQuestionsPerRound, "並列Treeの方が1Roundあたりの質問数が多い");
  const capped = DT.computeFrontierStats([node("a",[]),node("b",[]),node("c",[]),node("d",[]),node("e",[]),node("f",[])], 4);
  ok(capped.estimatedRounds === 2, "上限4問なら6論点は2Round (" + capped.estimatedRounds + ")");
  const cyclic = DT.computeFrontierStats([node("x", ["y"]), node("y", ["x"])], 4);
  ok(cyclic.estimatedRounds >= 0, "循環があっても無限ループしない");

  console.log("\n[Q11b] archetypeが過剰に直列化していない（回帰防止）");
  for (const a of ["sales", "software", "business", "investment", "productivity", "generic"]) {
    const t = ARCH.archetypeTree(a);
    const st = DT.computeFrontierStats(t, TYPES.MAX_QUESTIONS_PER_ROUND);
    ok(st.initialFrontierSize >= 2, `${a}: 初期Frontierが2件以上 (${st.initialFrontierSize})`);
    ok(st.maxDependencyDepth <= 4, `${a}: 依存の深さが4以下 (${st.maxDependencyDepth})`);
    ok(st.estimatedRounds <= Math.ceil(t.length / 2), `${a}: ${t.length}論点を${st.estimatedRounds}Roundで消化（過剰直列でない）`);
    ok(st.averageVisibleQuestionsPerRound >= 1.5, `${a}: 1Roundあたり平均${st.averageVisibleQuestionsPerRound}問`);
  }

  console.log("\n[Q12] Shared Understanding Quality Gate");
  const sessionForGate = {
    topic: "t",
    designTree: [{ ...node("d1", []), status: "answered", title: "保存方式", answer: "Redis中心" }],
  };
  const goodSu = {
    summary: "まとめ", majorDecisions: [{ decision: "保存方式: Redis中心", reason: "既存構成に合う" }],
    rejectedAlternatives: [{ alternative: "A", reason: "B" }], risks: [], remainingAssumptions: [],
    implementationScope: ["実装する"], acceptanceCriteria: ["完了条件"],
  };
  const g1 = SUG.validateSharedUnderstanding(goodSu, sessionForGate, 1);
  ok(g1.shouldRetry === false, "十分なSUはretry不要");
  ok(g1.unsupportedDecisions === 0, "根拠のある決定は捏造扱いしない");
  const emptySu = { ...goodSu, majorDecisions: [] };
  ok(SUG.validateSharedUnderstanding(emptySu, sessionForGate, 1).shouldRetry === true, "Major Decisionsが空ならretry対象");
  ok(SUG.validateSharedUnderstanding({ ...goodSu, summary: "" }, sessionForGate, 1).shouldRetry === true, "summaryが空ならretry対象");
  const fabricated = { ...goodSu, majorDecisions: [{ decision: "全く無関係な決定事項XYZ", reason: "理由" }] };
  ok(SUG.validateSharedUnderstanding(fabricated, sessionForGate, 1).unsupportedDecisions === 1, "回答に根拠が無い決定を捏造として検出");
  ok(SUG.validateSharedUnderstanding({ ...goodSu, implementationScope: [] }, sessionForGate, 1).warnings.some((w) => /Implementation Scope/.test(w)), "Implementation Scope空を警告");
  ok(SUG.validateSharedUnderstanding({ ...goodSu, acceptanceCriteria: [] }, sessionForGate, 1).warnings.some((w) => /Acceptance Criteria/.test(w)), "Acceptance Criteria空を警告");
  ok(SUG.validateSharedUnderstanding(goodSu, sessionForGate, 5).warnings.some((w) => /Rejected Alternatives/.test(w)), "却下案がSession実データと不一致なら警告");
  ok(SUG.validateSharedUnderstanding(null, sessionForGate, 0).shouldRetry === true, "SU未生成はretry対象");

  console.log("\n[Q13] fallbackReason の記録");
  const vfb = await ORCH.startGrilling({ topic: "仕事の時間管理ルールを作りたい" });
  const genMeta = vfb.session.quality.generation;
  ok(!!genMeta, "generationメタが記録される");
  if (vfb.session.quality.fallbackUsed) {
    ok(!!genMeta.fallbackReason, "fallback時は理由コードを記録: " + genMeta.fallbackReason);
    ok(/^(invalid_json|quality_gate_failed|invalid_api_key|model_permission|model_unavailable|rate_limited|input_too_long|provider_error|timeout|empty_response)$/.test(genMeta.fallbackReason), "理由コードは既定の集合内");
  } else {
    ok(genMeta.fallbackReason === undefined, "LLM成功時はfallbackReasonなし");
  }
  ok(typeof genMeta.attempts === "number", "attemptsを記録");
  ok(genMeta.designTree?.source === vfb.session.quality.designTreeSource, "Design Tree段階のsourceを記録");
  ok(typeof genMeta.designTree?.attempts === "number", "Design Tree段階のattemptsを記録");
  ok(!JSON.stringify(genMeta).includes("AIza"), "generationメタにSecretが含まれない");
  ok(!!vfb.session.quality.frontierStats, "frontierStatsが記録される");

  console.log("\n[Q14] Benchmark定義 A〜H（Phase5.3クロスドメイン）");
  const ids = BM.BENCHMARK_SCENARIOS.map((x) => x.id);
  ok(JSON.stringify(ids) === JSON.stringify(["A","B","C","D","E","F","G","H"]), "A〜Hが定義されている: " + ids.join(","));
  for (const id of ["F", "G", "H"]) {
    const sc = BM.getScenario(id);
    ok(!!sc && sc.topic.length > 5, `${id}: topic定義あり (${sc.topic.slice(0, 24)}…)`);
    ok(sc.expectedSignals.length >= 8, `${id}: expectedSignals ${sc.expectedSignals.length}件`);
    ok(sc.outOfScopeSignals.length >= 4, `${id}: outOfScopeSignals ${sc.outOfScopeSignals.length}件`);
    ok(!!sc.domain, `${id}: domain=${sc.domain}`);
  }
  ok(BM.getScenario("F").multiRound === true && BM.getScenario("F").sharedUnderstanding === true, "F: Round3+SUまで実行する設定");
  ok(BM.getScenario("H").multiRound === true && BM.getScenario("H").sharedUnderstanding === true, "H: Round3+SUまで実行する設定");
  ok(BM.getScenario("G").multiRound !== true, "G: 単発記事なのでRound3までは必須にしない");
  ok(BM.BENCHMARK_SCENARIOS.filter((x) => ["A","B","C","D","E"].includes(x.id)).length === 5, "既存A〜Eを削除していない");
  ok(BM.selectBenchmarkScenarios(undefined).length === 8, "BENCH_SCENARIOS未指定はA〜H");
  ok(BM.selectBenchmarkScenarios("g,H,g").map((x) => x.id).join(",") === "G,H", "部分指定を正規化・重複除去");
  let unknownRejected = false;
  try { BM.selectBenchmarkScenarios("G,Z"); } catch (e) { unknownRejected = /Unknown BENCH_SCENARIOS/.test(String(e.message)); }
  ok(unknownRejected, "未知scenarioを実行前に拒否");

  console.log("\n[Q15] Scope Fidelity（Scope外への拡張を検出）");
  const mkn = (id, title, q) => ({ id, title, question: q, dependsOn: [], status: "blocked", recommendation: "A案", recommendationReason: "十分な長さの理由をここに記載します", children: [] });
  const gScenario = BM.getScenario("G");
  const inScope = [mkn("a", "読者の悩み", "この記事の読者はどんな悩みを持っていますか。"), mkn("b", "無料と有料の境界", "どこまでを無料にしますか。")];
  const outScope = [...inScope, mkn("c", "組織体制", "組織体制をどう設計しますか。"), mkn("d", "営業チャネル", "営業チャネルをどう作りますか。")];
  const sIn = BM.scoreScopeFidelity(inScope, gScenario);
  const sOut = BM.scoreScopeFidelity(outScope, gScenario);
  ok(sIn.grade === "A" && sIn.outOfScopeCount === 0, "Scope内のみ → A");
  ok(sOut.outOfScopeCount === 2, "Scope外ノードを2件検出");
  ok(sOut.grade === "D" || sOut.grade === "C", "Scope外が多いと降格: " + sOut.grade);
  ok(sOut.outOfScopeNodes.some((x) => x.signal === "組織体制"), "検出したシグナルを記録");

  console.log("\n[Q16] Topic Specificity（汎用Treeの検出）");
  const fScenario = BM.getScenario("F");
  const genericTree = [mkn("g1", "目的", "目的は何ですか。"), mkn("g2", "対象", "対象は誰ですか。"), mkn("g3", "方法", "方法はどうしますか。"), mkn("g4", "スケジュール", "スケジュールは。")];
  const specificTree = [mkn("f1", "ターゲット読者", "誰に向けて書きますか。"), mkn("f2", "無料と有料の設計", "何を有料にしますか。"), mkn("f3", "記事本数と頻度", "何本をどの頻度で出しますか。"), mkn("f4", "価格とCTA", "価格とCTAをどうしますか。"), mkn("f5", "KPI", "どのKPIを見ますか。")];
  const gGen = BM.scoreTopicSpecificity(genericTree, fScenario);
  const gSpec = BM.scoreTopicSpecificity(specificTree, fScenario);
  ok(gGen.genericTitles.length >= 3, "汎用タイトルを検出 " + gGen.genericTitles.length + "件");
  ok(gGen.grade === "D" || gGen.grade === "C", "汎用Treeは低評価: " + gGen.grade);
  ok(gSpec.signalCoverage > gGen.signalCoverage, "topic固有Treeの方がシグナル一致率が高い");
  ok(gSpec.grade === "A" || gSpec.grade === "B", "topic固有Treeは高評価: " + gSpec.grade);

  console.log("\n[Q17] Recommendation品質（一般論の検出）");
  const genericRec = [{ ...mkn("r1", "T", "Q?"), recommendation: "ケースバイケースです", recommendationReason: "状況によります" }];
  const goodRec = [{ ...mkn("r2", "T", "Q?"), recommendation: "Redis中心", recommendationReason: "既存Context Busが同方式で、Vercelの読み取り専用FSでも永続化できるため" }];
  ok(BM.scoreRecommendationQuality(genericRec).genericPhrases.length >= 1, "一般論フレーズを検出");
  ok(BM.scoreRecommendationQuality(genericRec).grade === "C" || BM.scoreRecommendationQuality(genericRec).grade === "D", "一般論は低評価");
  ok(BM.scoreRecommendationQuality(goodRec).grade === "A", "Session固有の推奨はA");
  ok(BM.scoreRecommendationQuality([{ ...mkn("r3", "T", "Q?"), recommendationReason: "" }]).missingReason.length === 1, "理由欠落を検出");

  console.log("\n[Q18] Cross-domain 類似度 / Domain Genericity");
  const same = BM.treeSimilarity(specificTree, specificTree);
  const diff = BM.treeSimilarity(specificTree, genericTree);
  ok(same > diff, `同一Tree(${same}) > 別Tree(${diff}) の類似度`);
  ok(same >= 0.9, "同一Treeの類似度はほぼ1: " + same);
  ok(BM.scoreDomainGenericity([0.05, 0.1]).grade === "A", "類似度が低ければ A（domain固有）");
  ok(BM.scoreDomainGenericity([0.5]).grade === "D", "類似度が高ければ D（使い回しの疑い）");

  console.log("\n[Q19] 依存の付けすぎを機械的に是正（実LLM対策）");
  const overDep = [mkn("n1", "n1", "n1について、AとBのどちらにしますか。"),
                   { ...mkn("n2", "n2", "n2について、AとBのどちらにしますか。"), dependsOn: ["n1"] },
                   { ...mkn("n3", "n3", "n3について、AとBのどちらにしますか。"), dependsOn: ["n1", "n2"] },
                   { ...mkn("n4", "n4", "n4について、AとBのどちらにしますか。"), dependsOn: ["n1", "n2", "n3"] },
                   { ...mkn("n5", "n5", "n5について、AとBのどちらにしますか。"), dependsOn: ["n1", "n2", "n3", "n4"] }];
  const trimmed = VAL.validateAndSanitizeTree(overDep);
  ok(trimmed.nodes.find((n) => n.id === "n4").dependsOn.length === 3, "本当に必要な3依存を保持可能");
  ok(trimmed.warnings.some((w) => /推奨2件以下/.test(w)), "Soft Limit超過を警告として記録");
  ok(trimmed.nodes.find((n) => n.id === "n5").dependsOn.length === 4, "4依存も警告のみで保持");
  const beforeStats = DT.computeFrontierStats(DT.sanitizeTree(overDep), 4);
  const afterStats = DT.computeFrontierStats(DT.computeNodeStatuses(trimmed.nodes), 4);
  ok(afterStats.maxDependencyDepth <= beforeStats.maxDependencyDepth, `依存の深さが悪化しない (${beforeStats.maxDependencyDepth}→${afterStats.maxDependencyDepth})`);

  console.log("\n[Q20] Benchmark限定Rate Limit retry（最大1回）");
  let retryCalls = 0, waited = -1;
  const retryResult = await QS.retryRateLimitedOnce(async () => {
    retryCalls++;
    if (retryCalls === 1) throw { isRateLimit: true, retryAfterMs: 7 };
    return "ok";
  }, true, async (ms) => { waited = ms; });
  ok(retryResult.value === "ok" && retryResult.attempts === 2 && retryCalls === 2, "429時だけ1回再試行");
  ok(waited === 7, "Retry-After待機時間を尊重");
  let maxCalls = 0;
  try {
    await QS.retryRateLimitedOnce(async () => { maxCalls++; throw { isRateLimit: true, retryAfterMs: 0 }; }, true, async () => {});
  } catch {}
  ok(maxCalls === 2, "再試行失敗時も合計2回で停止");
  let prodCalls = 0;
  try {
    await QS.retryRateLimitedOnce(async () => { prodCalls++; throw { isRateLimit: true }; }, false, async () => {});
  } catch {}
  ok(prodCalls === 1, "本番既定OFFでは再試行しない");

  console.log("\n[Q21] Provider error taxonomy / Structured Output");
  ok(GROQ.classifyGroqError(401, "") === "invalid_api_key", "Groq 401 → invalid_api_key");
  ok(GROQ.classifyGroqError(403, "") === "model_permission", "Groq 403 → model_permission");
  ok(GROQ.classifyGroqError(404, "") === "model_unavailable", "Groq 404 → model_unavailable");
  ok(GROQ.classifyGroqError(429, "") === "rate_limited", "Groq 429 → rate_limited");
  ok(GROQ.classifyGroqError(400, "maximum context token limit exceeded") === "input_too_long", "Groq context超過 → input_too_long");
  ok(GROQ.classifyGroqError(500, "internal") === "provider_error", "Groq その他 → provider_error");
  const jsonBody = GROQ.buildGroqRequestBody([{ role: "user", content: "x" }], "json");
  const textBody = GROQ.buildGroqRequestBody([{ role: "user", content: "x" }], "text");
  ok(jsonBody.response_format?.type === "json_object", "Groq JSON Object ModeをProvider層で設定");
  ok(textBody.response_format === undefined, "通常呼び出しはStructured Outputを強制しない");
  ok(AIERR.parseRetryAfterMs("2", "") === 2000, "Retry-After秒を解析");
  ok(AIERR.parseRetryAfterMs(null, '{"retryDelay":"3.5s"}') === 3500, "API retryDelayを解析");

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
    const fs2 = sn.quality.frontierStats;
    ok(!!fs2, `frontierStats: 初期${fs2.initialFrontierSize}問 / 推定${fs2.estimatedRounds}Round / depth${fs2.maxDependencyDepth} / 平均${fs2.averageVisibleQuestionsPerRound}問`);
    seenTitleSets.push(sn.designTree.map((n) => n.title).join("|"));
  }
  ok(new Set(seenTitleSets).size === scenarios.length, "5シナリオすべてTree構造が異なる（topic固有）");

  console.log("\n==========================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
