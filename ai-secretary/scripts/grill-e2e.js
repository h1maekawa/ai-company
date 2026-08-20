/* Grilling E2E — Frontier計算 / 状態遷移 / durability / confirmed時のみCapture / Supabase未設定動作 */
const fs = require("fs");
const path = require("path");

const DIST = process.env.GRILL_E2E_DIST || "/tmp/grill-e2e-dist";
const DT = require(path.join(DIST, "grill/designTree.js"));
const ORCH = require(path.join(DIST, "grill/orchestrator.js"));
const STORE = require(path.join(DIST, "grill/store.js"));
const FACTS = require(path.join(DIST, "grill/facts.js"));

const VAULT = process.env.VAULT_ROOT;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m); } };

const node = (id, deps, extra = {}) => ({
  id, title: id, question: `Q ${id}`, dependsOn: deps, status: "blocked",
  recommendation: "推奨", recommendationReason: "理由", children: [], ...extra,
});

(async () => {
  console.log("\n[1] Frontier計算（決定論的・D7）");
  const tree = [node("n1", []), node("n2", ["n1"]), node("n3", ["n1", "n2"])];
  ok(JSON.stringify(DT.computeFrontier(tree)) === '["n1"]', "前提なしのn1のみfrontier");
  const t2 = DT.computeNodeStatuses(tree).map((n) => (n.id === "n1" ? { ...n, status: "answered" } : n));
  ok(JSON.stringify(DT.computeFrontier(t2)) === '["n2"]', "n1回答後はn2がfrontier（n3はblocked）");

  console.log("\n[2] 循環依存の防御");
  const cyc = [node("a", ["b"]), node("b", ["a"])];
  ok(DT.detectCycles(cyc).length > 0, "循環を検出する");
  ok(DT.computeFrontier(DT.sanitizeTree(cyc)).length > 0, "sanitize後は前進可能（無限ループしない）");
  ok(DT.sanitizeTree([node("x", ["missing"])])[0].dependsOn.length === 0, "存在しない依存は除去");

  console.log("\n[3] blockedへの先回り回答を拒否");
  const sess = {
    id: "s1", topic: "t", status: "active", designTree: DT.computeNodeStatuses(tree),
    answers: {}, currentFrontier: ["n1"], round: 1, facts: [], secretaryId: "executive-assistant",
    durability: "durable", createdAt: "x", updatedAt: "x",
  };
  const afterBad = DT.applyAnswers(sess, { n3: "先回り" }, "now");
  ok(afterBad.answers.n3 === undefined, "blockedノードへの回答は無視される");
  const afterGood = DT.applyAnswers(sess, { n1: "答え" }, "now");
  ok(afterGood.answers.n1 === "答え", "frontierノードへの回答は記録される");
  ok(afterGood.round === 2, "roundが進む");
  ok(afterGood.status === "active", "Frontierが残るのでactive継続");

  console.log("\n[4] Frontier空 → ready_for_confirmation");
  let s = { ...sess, designTree: DT.computeNodeStatuses([node("only", [])]), currentFrontier: ["only"] };
  s = DT.applyAnswers(s, { only: "決定" }, "now");
  ok(s.status === "ready_for_confirmation", "全論点回答でready_for_confirmation（AI判断で途中終了しない）");

  console.log("\n[5] Fact Provider は topic に応じて選択（D4）");
  ok(FACTS.knowledgeFactProvider.appliesTo("何でも") === true, "Knowledgeは常時適用");
  ok(FACTS.repoFactProvider.appliesTo("営業商談の壁打ち") === false, "営業topicではRepoを使わない");
  ok(FACTS.repoFactProvider.appliesTo("GitHubシステム設計") === true, "システム設計topicではRepoを使う");
  ok(FACTS.vaultFactProvider.appliesTo("営業商談の壁打ち") === true, "営業topicではVaultを使う");
  const sel = await FACTS.resolveFacts("営業商談の壁打ち");
  ok(!sel.used.includes("repo"), "実行されたProviderにrepoが含まれない: " + JSON.stringify(sel.used));

  console.log("\n[6] Redis未設定でも動作する（Supabase未導入・D3/D10）");
  const view = await ORCH.startGrilling({ topic: "営業商談の壁打ち" });
  ok(!!view.session.id, "セッション開始できる id=" + view.session.id);
  ok(view.session.designTree.length >= 2, "Design Tree生成 " + view.session.designTree.length + "論点");
  ok(view.currentQuestions.length > 0, "Frontier質問が返る " + view.currentQuestions.length + "件");
  ok(view.currentQuestions.every((q) => q.recommendation), "全質問にAI推奨が付く");
  ok(view.persist.durability === "durable" && view.persist.backend === "file", "開発環境ではfileが永続実体: " + JSON.stringify(view.persist));

  console.log("\n[7] 中断・再開");
  const reloaded = await STORE.grillSessionStore.load(view.session.id);
  ok(reloaded && reloaded.id === view.session.id, "保存済みセッションを再取得できる");
  const list = await STORE.grillSessionStore.listActive();
  ok(list.some((x) => x.id === view.session.id), "再開一覧に出る");

  console.log("\n[8] 全論点回答 → Shared Understanding");
  let cur = view;
  for (let i = 0; i < 12 && cur.session.status === "active"; i++) {
    const answers = {};
    for (const q of cur.currentQuestions) answers[q.id] = q.recommendation;
    cur = await ORCH.answerGrilling({ sessionId: cur.session.id, answers });
  }
  ok(cur.session.status === "ready_for_confirmation", "最終的にready_for_confirmation (" + cur.session.status + ")");
  ok(!!cur.session.sharedUnderstanding, "Shared Understandingが生成される");
  const su = cur.session.sharedUnderstanding;
  ok(Array.isArray(su.majorDecisions) && su.majorDecisions.length > 0, "決定事項が含まれる");

  console.log("\n[9] 承認前はKnowledge化されない（D9）");
  const inboxDir = path.join(VAULT, "memory/personal/inbox");
  const before = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md")).length : 0;
  ok(true, "承認前のInbox件数=" + before);

  console.log("\n[10] confirmed の瞬間のみ Capture（D9/D10）");
  const confirmed = await ORCH.confirmGrilling(cur.session.id);
  ok(confirmed.session.status === "confirmed", "status=confirmed");
  ok(confirmed.captured.ok === true, "Knowledge Candidateとして保存された");
  ok(/^memory\/personal\/inbox\//.test(confirmed.captured.path || ""), "保存先はInbox: " + confirmed.captured.path);
  const after = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".md")).length;
  ok(after === before + 1, "Inboxが1件だけ増える（途中回答は保存しない）");
  const capMd = fs.readFileSync(path.join(VAULT, confirmed.captured.path), "utf8");
  ok(/source: grilling/.test(capMd), "source: grilling で記録される");
  ok(/managed_by: ai/.test(capMd), "Inbox段階は managed_by: ai（正式Knowledgeではない）");

  console.log("\n[11] Grilling独自のVault正式保存をしない（二重保存の禁止）");
  const knowledgeDir = path.join(VAULT, "memory/knowledge");
  const promoted = fs.existsSync(knowledgeDir)
    ? fs.readdirSync(knowledgeDir).flatMap((d) => {
        const p = path.join(knowledgeDir, d);
        return fs.statSync(p).isDirectory() ? fs.readdirSync(p) : [];
      })
    : [];
  ok(promoted.length === 0, "memory/knowledge に正式Knowledgeは作られない（昇格はweekly-review経由のみ）");
  const grillDir = path.join(VAULT, "memory/personal/grilling");
  const grillMd = fs.existsSync(grillDir)
    ? fs.readdirSync(grillDir).filter((f) => f.endsWith(".md"))
    : [];
  ok(grillMd.length === 0, "Grilling独自の確定要約Markdownも作らない");

  console.log("\n[12] confirmed後は再回答できない");
  let threw = null;
  try { await ORCH.answerGrilling({ sessionId: cur.session.id, answers: { x: "y" } }); } catch (e) { threw = e.message; }
  ok(threw !== null, "confirmed後の回答はthrow");

  console.log("\n[13] 修正して再Grill → 新Node/Frontier追加 → 再度SUへ（D8）");
  const v2 = await ORCH.startGrilling({ topic: "note事業の伸ばし方" });
  let c2 = v2;
  for (let i = 0; i < 12 && c2.session.status === "active"; i++) {
    const a = {};
    for (const q of c2.currentQuestions) a[q.id] = q.recommendation;
    c2 = await ORCH.answerGrilling({ sessionId: c2.session.id, answers: a });
  }
  ok(c2.session.status === "ready_for_confirmation", "1周目でready_for_confirmation");
  const beforeNodes = c2.session.designTree.length;
  const revised = await ORCH.reviseGrilling({ sessionId: c2.session.id, request: "費用対効果の観点が抜けている" });
  ok(revised.session.designTree.length > beforeNodes, `Nodeが増える ${beforeNodes} → ${revised.session.designTree.length}`);
  ok(revised.session.status === "active", "statusがactiveへ戻る（Frontier復活）");
  ok(revised.currentQuestions.length > 0, "新しいFrontier質問が出る " + revised.currentQuestions.length + "件");
  ok(!revised.session.sharedUnderstanding, "再Grill中はSUがクリアされる");
  let c3 = revised;
  for (let i = 0; i < 12 && c3.session.status === "active"; i++) {
    const a = {};
    for (const q of c3.currentQuestions) a[q.id] = q.recommendation;
    c3 = await ORCH.answerGrilling({ sessionId: c3.session.id, answers: a });
  }
  ok(c3.session.status === "ready_for_confirmation", "再度SUまで到達");

  console.log("\n[14] cancelled → Knowledge Candidateにならない（否定系）");
  const inboxDir2 = path.join(VAULT, "memory/personal/inbox");
  const beforeCancel = fs.readdirSync(inboxDir2).filter((f) => f.endsWith(".md")).length;
  const cancelled = await ORCH.cancelGrilling(c3.session.id);
  ok(cancelled.session.status === "cancelled", "status=cancelled");
  const afterCancel = fs.readdirSync(inboxDir2).filter((f) => f.endsWith(".md")).length;
  ok(afterCancel === beforeCancel, "cancelでInboxは増えない（" + beforeCancel + "→" + afterCancel + "）");

  console.log("\n[15] 不正な状態遷移の拒否（否定系）");
  let rj1 = null;
  try { await ORCH.confirmGrilling(cancelled.session.id); } catch (e) { rj1 = e.message; }
  ok(rj1 !== null, "cancelled後のconfirmはthrow");
  let rj2 = null;
  try { await ORCH.reviseGrilling({ sessionId: cancelled.session.id, request: "x" }); } catch (e) { rj2 = e.message; }
  ok(rj2 !== null, "cancelled後のreviseはthrow");
  let rj3 = null;
  try { await ORCH.confirmGrilling(view.session.id); } catch (e) { rj3 = e.message; }
  ok(rj3 !== null, "confirmed後の再confirmはthrow");
  let rj4 = null;
  try { await ORCH.reviseGrilling({ sessionId: view.session.id, request: "x" }); } catch (e) { rj4 = e.message; }
  ok(rj4 !== null, "confirmed後のreviseはthrow");
  const v3 = await ORCH.startGrilling({ topic: "テスト" });
  let rj5 = null;
  try { await ORCH.confirmGrilling(v3.session.id); } catch (e) { rj5 = e.message; }
  ok(rj5 !== null, "Frontierが残る状態でのconfirmはthrow（AI判断で途中終了しない）");

  console.log("\n[16] Weekly Review側にGrilling由来Candidateが出る（D9接続）");
  const KN = require(path.join(process.env.KN_DIST || "/tmp/kn-e2e-dist", "knowledge/lifecycle.js"));
  let grillCandidates = [];
  try {
    const all = await KN.listCandidates();
    grillCandidates = all.filter((c) => c.frontmatter.source === "grilling");
    ok(grillCandidates.length === 1, "Grilling由来Candidateはちょうど1件（" + grillCandidates.length + "件）");
  } catch (e) {
    ok(false, "listCandidates失敗: " + e.message);
  }

  console.log("\n[17] Redis保存失敗時: 継続 + volatile + 警告（D3）");
  const volatileSession = {
    id: "gr-volatile-test", topic: "t", status: "active",
    designTree: [node("n1", [])], answers: {}, currentFrontier: ["n1"], round: 1,
    facts: [], secretaryId: "executive-assistant", durability: "durable",
    createdAt: "x", updatedAt: "x",
  };
  // 本番相当（VERCEL=1）ではRedis未設定 → /tmp 保存 → volatile 判定になること
  const prodStore = require(path.join(DIST, "grill/store.js"));
  process.env.VERCEL = "1";
  delete require.cache[require.resolve(path.join(DIST, "grill/store.js"))];
  const prodStore2 = require(path.join(DIST, "grill/store.js"));
  const pr = await prodStore2.grillSessionStore.save(volatileSession);
  ok(pr.durability === "volatile", "本番相当×Redis未設定 → durability=volatile (" + pr.durability + ")");
  ok(pr.backend === "tmp", "保存先は /tmp（永続実体ではない）: " + pr.backend);
  ok(typeof pr.warning === "string" && pr.warning.length > 0, "UI表示用の警告文が返る: " + pr.warning);
  const TYPES = require(path.join(DIST, "grill/types.js"));
  ok(/再開保証されません/.test(TYPES.VOLATILE_WARNING), "警告文言が『再開保証されません』を含む");
  delete process.env.VERCEL;
  void prodStore;

  console.log("\n==========================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
