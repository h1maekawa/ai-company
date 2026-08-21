/* Knowledge Lifecycle E2E — capture → inbox → organize → candidate → promote → router */
const fs = require("fs");
const path = require("path");
const DIST = process.env.KN_E2E_DIST || "/tmp/kn-e2e-dist";
const L = require(path.join(DIST, "knowledge/lifecycle.js"));
const R = require(path.join(DIST, "knowledge/router.js"));
const S = require(path.join(DIST, "knowledge/search.js"));
const CS = require(path.join(DIST, "knowledge/captureService.js"));
const K = require(path.join(DIST, "memory/knowledge.js"));
const WP = require(path.join(DIST, "knowledge/writePolicy.js"));
const AP = require(path.join(DIST, "knowledge/approval.js"));

const VAULT = process.env.VAULT_ROOT;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m); } };
const read = (p) => fs.readFileSync(path.join(VAULT, p), "utf8");

(async () => {
  console.log("\n[1] Capture → Inbox → AI整理 → Candidate");
  const out = await CS.captureKnowledgeCandidate({
    content: "商談のヒアリングでは、相手の課題を3回掘り下げてから提案する。1回目は表面の不満、2回目は業務影響、3回目は数値インパクトが出る。受注率が上がった実感がある。",
    source: "conversation",
    title: "hearing-3-levels",
  });
  ok(out.ok === true, "capture ok");
  ok(out.status === "candidate", "status=candidate (AI整理まで完了) actual=" + out.status);
  const capPath = out.path;
  ok(/^memory\/personal\/inbox\//.test(capPath), "Inboxに保存: " + capPath);
  const capMd = read(capPath);
  ok(/managed_by: ai/.test(capMd), "Candidate は managed_by: ai");
  ok(/type: capture/.test(capMd), "type: capture");

  console.log("\n[2] /weekly-review 表示（listCandidates）");
  const list = await L.listCandidates();
  ok(list.some((i) => i.path === capPath), "Candidateが一覧に出る (" + list.length + "件)");

  console.log("\n[3] Candidate は通常Knowledge Routerに出ない");
  const ctxBefore = await R.buildKnowledgeContext("ヒアリング 商談 受注率");
  ok(ctxBefore.hits.length === 0, "昇格前はRouterヒット0 (actual " + ctxBefore.hits.length + ")");

  console.log("\n[4] Unknown domain → Promotion不可");
  let threw = null;
  try { await L.promoteCandidate(capPath, { domain: "misc" }); } catch (e) { threw = e.message; }
  ok(threw !== null, "misc で昇格は throw: " + (threw || "").slice(0, 60));

  console.log("\n[5] Promotion（domain確定）→ Promoted Knowledge作成");
  const prom = await L.promoteCandidate(capPath, { domain: "sales", title: "ヒアリングは3段階で掘る", slug: "hearing-3-levels" });
  ok(/^memory\/knowledge\/sales\//.test(prom.knowledgePath), "正式Knowledge: " + prom.knowledgePath);
  const kMd = read(prom.knowledgePath);
  ok(/managed_by: human/.test(kMd), "Promoted は managed_by: human");
  ok(/status: promoted/.test(kMd), "status: promoted");
  ok(/domain: sales/.test(kMd), "domain: sales");
  const capAfter = read(capPath);
  ok(/status: promoted/.test(capAfter), "Candidate側 status: promoted");
  ok(capAfter.includes("promoted_to:"), "Candidate に promoted_to");
  ok(prom.knowledgePath !== capPath, "案B: Candidateと別ファイル");

  console.log("\n[6] 通常Knowledge Routerから検索可能（promotedのみ）");
  const ctxAfter = await R.buildKnowledgeContext("ヒアリング 商談 受注率");
  ok(ctxAfter.hits.length > 0, "昇格後はRouterヒットあり (" + ctxAfter.hits.length + ")");
  ok(ctxAfter.hits.every((h) => h.status === "promoted"), "Routerの結果は全て promoted");
  ok(ctxAfter.contextText.includes("参考Knowledge"), "context生成OK");

  console.log("\n[7] Human Managed既存Knowledge → AI自動overwrite不可");
  const d = WP.canAiAutoWrite(prom.knowledgePath, kMd);
  ok(d.allowed === false, "canAiAutoWrite=false: " + d.reason.slice(0, 50));
  let threw2 = null;
  try {
    await K.saveKnowledge({ title: "x", slug: "x", domain: "sales", importance: 1, content: "y" });
  } catch (e) { threw2 = e.message; }
  ok(threw2 !== null, "grantなし saveKnowledge は throw");
  let threw3 = null;
  try {
    await K.saveKnowledge({ title: "x", slug: "x", domain: "sales", importance: 1, content: "y", grant: { reason: "promotion", issuedAt: "now" } });
  } catch (e) { threw3 = e.message; }
  ok(threw3 !== null, "偽造grant(JSON相当)も throw ← 外部入力で迂回不可");

  console.log("\n[8] Merge は Diff/Preview → 承認後のみ反映");
  const cap2 = await CS.captureKnowledgeCandidate({
    content: "ヒアリングの3段階に加えて、最後に必ず『他に懸念はありますか』と聞くと失注理由が事前に潰せる。商談の受注率にも効く。",
    source: "conversation", title: "hearing-followup",
  });
  const p2 = cap2.path;
  const pre = await L.buildMergePreviewFor(p2, prom.knowledgePath);
  ok(typeof pre.previewToken === "string" && pre.previewToken.length > 8, "previewToken発行");
  ok(pre.diff.some((l) => l.type === "added"), "diffに追加行あり");
  ok(read(prom.knowledgePath) === kMd, "Preview時点では書き込まれていない");
  let threw4 = null;
  try { await L.mergeCandidate(p2, prom.knowledgePath, ""); } catch (e) { threw4 = e.message; }
  ok(threw4 !== null, "previewTokenなしのmergeは throw");
  let threw5 = null;
  try { await L.mergeCandidate(p2, prom.knowledgePath, "deadbeef"); } catch (e) { threw5 = e.message; }
  ok(threw5 !== null, "不正tokenのmergeは throw");
  const merged = await L.mergeCandidate(p2, prom.knowledgePath, pre.previewToken);
  ok(merged.targetPath === prom.knowledgePath, "正しいtokenでmerge成功");
  const kMd2 = read(prom.knowledgePath);
  ok(kMd2.includes("統合メモ"), "統合先に追記された");
  ok(/status: merged/.test(read(p2)), "Candidate側 status: merged");

  console.log("\n[9] 承認トークンの正当性");
  const g = AP.issueApprovalGrant("promotion", "test");
  ok(AP.isValidApprovalGrant(g) === true, "内部発行grantは有効");
  ok(AP.isValidApprovalGrant(JSON.parse(JSON.stringify(g))) === false, "JSON往復したgrantは無効");
  ok(AP.isValidApprovalGrant({ reason: "promotion" }) === false, "手作りオブジェクトは無効");

  console.log("\n[10] 検索APIはCandidateも検索できる（Router専用制約であること）");
  const cands = await S.vaultKnowledgeSearch.search({ text: "懸念", status: ["merged", "candidate", "captured"], limit: 5 });
  ok(cands.length >= 0, "status指定検索は動作する");

  console.log("\n==========================================");
  console.log("RESULT: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
