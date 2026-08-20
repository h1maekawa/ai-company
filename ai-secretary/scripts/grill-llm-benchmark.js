/**
 * Grilling 実LLMベンチマーク（Phase 5.2）。
 *
 * 目的: fallback archetype ではなく、**実際のLLM**が生成するDesign Tree・質問・
 * Recommendation・Shared Understanding の品質を実測する。
 *
 * 使い方（ネットワークとAPIキーがある環境＝ユーザーのMacで実行）:
 *   cd ai-secretary && npm run bench:grill
 *
 * 安全性:
 * - 既定では一時Vault（/tmp）に対して実行し、実Vaultへは書き込まない。
 *   Factsの実データを使いたい場合のみ  GRILL_BENCH_REAL_VAULT=1  を付ける（読み取り中心）。
 * - confirm（Knowledge Capture）は実行しないので、Inbox/正式Knowledgeは汚れない。
 * - APIキーは .env.local から読むだけで、出力・保存は一切しない。
 */
const fs = require("fs");
const path = require("path");

const DIST = process.env.GRILL_E2E_DIST || "/tmp/grill-bench-dist";
const ORCH = require(path.join(DIST, "grill/orchestrator.js"));
const AI = require(path.join(DIST, "ai/client.js"));
const VAL = require(path.join(DIST, "grill/validate.js"));

const OUT = process.env.BENCH_OUT || path.join(__dirname, "..", "..", "docs", "16_GRILLING_LLM_QUALITY_REPORT.md");

const SCENARIOS = [
  ["A. Sales", "HP制作商談の受注率を上げたい"],
  ["B. Software Architecture", "新しいタスク管理システムを設計したい"],
  ["C. Business", "AI受託事業の営業モデルを設計したい"],
  ["D. Investment", "個別株の売買ルールを決めたい"],
  ["E. Productivity", "仕事の時間管理ルールを作りたい"],
];
/** 複数Roundを実際に進めるシナリオ（最低2件） */
const MULTI_ROUND = ["A. Sales", "B. Software Architecture"];

const lines = [];
const out = (s = "") => { lines.push(s); console.log(s); };

function treeTable(session) {
  const rows = ["| Node | 質問 | dependsOn | 推奨 | 推奨理由 |", "|---|---|---|---|---|"];
  for (const n of session.designTree) {
    const esc = (t) => String(t || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    rows.push(
      `| ${esc(n.title)} | ${esc(n.question).slice(0, 90)} | ${n.dependsOn.join(",") || "—"} | ${esc(n.recommendation).slice(0, 50)} | ${esc(n.recommendationReason).slice(0, 110)} |`
    );
  }
  return rows.join("\n");
}

async function runRounds(view, maxRounds) {
  const log = [];
  let cur = view;
  for (let r = 1; r <= maxRounds; r++) {
    if (cur.session.status !== "active") break;
    const qs = cur.visibleQuestions;
    if (qs.length === 0) break;
    log.push({
      round: cur.session.round,
      questions: qs.map((q) => ({
        title: q.title,
        question: q.question,
        dependsOn: q.dependsOn,
        recommendation: q.recommendation,
        reason: q.recommendationReason,
        options: (q.options || []).map((o) => o.label),
      })),
    });
    const answers = {};
    for (const q of qs) answers[q.id] = q.recommendation;
    cur = await ORCH.answerGrilling({ sessionId: cur.session.id, answers });
  }
  return { log, view: cur };
}

async function completeAll(view) {
  let cur = view;
  for (let i = 0; i < 15 && cur.session.status === "active"; i++) {
    const answers = {};
    for (const q of cur.visibleQuestions) answers[q.id] = q.recommendation;
    if (Object.keys(answers).length === 0) break;
    cur = await ORCH.answerGrilling({ sessionId: cur.session.id, answers });
  }
  return cur;
}

/**
 * プリフライト: Grillingが実際に使う callAI() で疎通を確認する。
 * ここで失敗した場合、fallbackだらけの誤解を招くレポートで既存ファイルを
 * 上書きしないよう、**書き込まずに終了**する（BENCH_FORCE=1 で強制続行可）。
 */
async function preflight() {
  const provider = process.env.DEFAULT_PROVIDER || "(未設定)";
  const model = process.env.GEMINI_MODEL || process.env.GROQ_MODEL || "(既定)";
  console.log(`\n[preflight] provider=${provider} model=${model} で実LLMへの疎通を確認します...`);
  const t0 = Date.now();
  try {
    const reply = await AI.callAI("OK とだけ返してください。", "あなたは疎通確認用です。短く答えてください。", {});
    const ms = Date.now() - t0;
    const text = String(reply || "").trim().slice(0, 40);
    if (!text) throw new Error("空応答");
    console.log(`[preflight] ✅ 実LLM応答あり (${ms}ms): "${text}"`);
    return { ok: true, provider, model, ms, sample: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ms = Date.now() - t0;
    console.error(`\n[preflight] ❌ 実LLMへ到達できませんでした (${ms}ms)`);
    console.error(`[preflight] provider=${provider} model=${model}`);
    console.error(`[preflight] 失敗理由: ${msg.slice(0, 300)}`);
    console.error(`
────────────────────────────────────────────────────────
このまま実行しても、全シナリオが fallback（archetype）になり
実LLM品質の評価はできません。そのため docs/16 は上書きしません。

確認してください:
  1. ai-secretary/.env.local に GEMINI_API_KEY が設定されているか
  2. そのマシンから https://generativelanguage.googleapis.com へ出られるか
     （社内プロキシ・VPN・ファイアウォールでブロックされていないか）
     例: curl -s -o /dev/null -w '%{http_code}\n' https://generativelanguage.googleapis.com
  3. APIキーが有効か（期限切れ・課金停止・レート制限でないか）
  4. GROQ_API_KEY がある場合は DEFAULT_PROVIDER=groq でも試せます

どうしても fallback のまま記録したい場合のみ:
  BENCH_FORCE=1 npm run bench:grill
────────────────────────────────────────────────────────`);
    return { ok: false, provider, model, ms, error: msg.slice(0, 200) };
  }
}

(async () => {
  const pre = await preflight();
  if (!pre.ok && process.env.BENCH_FORCE !== "1") {
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  out(`# 16. Grilling 実LLM品質レポート（Phase 5.2）`);
  out();
  out(`- 実行日時: ${startedAt}`);
  out(`- Provider: ${process.env.DEFAULT_PROVIDER || "(未設定)"} / model: ${process.env.GEMINI_MODEL || process.env.GROQ_MODEL || "(既定)"}`);
  out(`- Vault: ${process.env.GRILL_BENCH_REAL_VAULT === "1" ? "実Vault（読み取り）" : "一時Vault（実データに触れない）"}`);
  out(`- LLM疎通(preflight): ${pre.ok ? `✅ 応答あり (${pre.ms}ms)` : `❌ 到達不可（${pre.error}）— 以下はfallback結果`}`);
  out(`- 注意: APIキー等のSecretは本レポートに一切記載しない。`);
  out();

  const summary = [];

  for (const [name, topic] of SCENARIOS) {
    out(`---`);
    out();
    out(`## ${name} — ${topic}`);
    out();
    console.error(`  → ${name} を生成中...`);
    const view = await ORCH.startGrilling({ topic });
    const s = view.session;
    console.error(`     source=${view.session.quality?.designTreeSource} nodes=${view.session.designTree.length}`);
    const q = s.quality || {};
    const fstat = q.frontierStats || {};

    out(`### 生成メタ`);
    out();
    out(`| 項目 | 値 |`);
    out(`|---|---|`);
    out(`| selected providers | ${(q.providerIds || []).join(" / ") || "—"} |`);
    out(`| designTreeSource | **${q.designTreeSource}** |`);
    out(`| fallbackUsed | **${q.fallbackUsed}** ${q.generation?.fallbackReason ? `(${q.generation.fallbackReason})` : ""} |`);
    out(`| generatedNodeCount | ${q.generatedNodeCount} |`);
    out(`| duplicateQuestionsRemoved | ${q.duplicateQuestionsRemoved} |`);
    out(`| validationWarnings | ${(q.validationWarnings || []).length}件 ${(q.validationWarnings || []).slice(0, 3).map((w) => `\`${w}\``).join(" ")} |`);
    out(`| currentFrontier | ${s.currentFrontier.length}件 |`);
    out(`| visibleQuestions | ${view.visibleQuestions.length}件 |`);
    out(`| initialFrontierSize | ${fstat.initialFrontierSize} |`);
    out(`| estimatedRounds | ${fstat.estimatedRounds} |`);
    out(`| maxDependencyDepth | ${fstat.maxDependencyDepth} |`);
    out(`| averageVisibleQuestionsPerRound | ${fstat.averageVisibleQuestionsPerRound} |`);
    out();
    out(`### Design Tree`);
    out();
    out(treeTable(s));
    out();

    // 重複質問の実測
    const fps = s.designTree.map((n) => VAL.questionFingerprint(n.question));
    const dupCount = fps.length - new Set(fps).size;
    out(`- 重複質問(指紋一致): ${dupCount}件`);
    out(`- 推奨が全Nodeにある: ${s.designTree.every((n) => n.recommendation) ? "はい" : "**いいえ**"}`);
    out(`- 推奨理由が全Nodeにある: ${s.designTree.every((n) => n.recommendationReason) ? "はい" : "**いいえ**"}`);
    out();

    summary.push({
      name, topic,
      source: q.designTreeSource, fallbackUsed: q.fallbackUsed,
      nodes: q.generatedNodeCount,
      initialFrontierSize: fstat.initialFrontierSize,
      estimatedRounds: fstat.estimatedRounds,
      maxDependencyDepth: fstat.maxDependencyDepth,
      warnings: (q.validationWarnings || []).length,
      fallbackReason: q.generation?.fallbackReason,
    });

    if (MULTI_ROUND.includes(name)) {
      out(`### Round 1〜3（推奨をそのまま採用して進行）`);
      out();
      const { log, view: after } = await runRounds(view, 3);
      for (const r of log) {
        out(`**Round ${r.round}** — ${r.questions.length}問`);
        out();
        for (const qq of r.questions) {
          out(`- ❓ **${qq.title}**: ${qq.question}`);
          if (qq.options.length) out(`  - 選択肢: ${qq.options.join(" / ")}`);
          out(`  - ➡️ 推奨: ${qq.recommendation}`);
          out(`  - 理由: ${qq.reason}`);
          out(`  - dependsOn: ${qq.dependsOn.join(",") || "—"}`);
        }
        out();
      }
      const answeredNow = after.session.designTree.filter((n) => n.status === "answered").length;
      out(`Round3終了時点: 回答済み ${answeredNow}/${after.session.designTree.length} ・ status=${after.session.status}`);
      out();

      // Shared Understanding まで到達させる
      const done = await completeAll(after);
      const su = done.session.sharedUnderstanding;
      out(`### Shared Understanding`);
      out();
      if (!su) {
        out(`（未生成: status=${done.session.status}）`);
      } else {
        const sec = (t, arr) => {
          out(`**${t}**`);
          out();
          if (!arr || arr.length === 0) out(`- （なし）`);
          else for (const x of arr) out(`- ${typeof x === "string" ? x : `${x.decision || x.alternative} — ${x.reason}`}`);
          out();
        };
        out(`**Summary**`); out(); out(su.summary); out();
        sec("Major Decisions", su.majorDecisions);
        sec("Rejected Alternatives", su.rejectedAlternatives);
        sec("Risks", su.risks);
        sec("Remaining Assumptions", su.remainingAssumptions);
        sec("Implementation Scope", su.implementationScope);
        sec("Non-Goals", su.nonGoals);
        sec("Constraints", su.constraints);
        sec("Acceptance Criteria", su.acceptanceCriteria);
        const suW = done.session.quality?.sharedUnderstandingWarnings || [];
        out(`SU Quality Gate 警告: ${suW.length}件`);
        for (const w of suW) out(`- ${w}`);
        out(`SU生成attempts: ${done.session.quality?.generation?.attempts ?? "-"}`);
        out();
      }
    }
  }

  out(`---`);
  out();
  out(`## サマリー`);
  out();
  out(`| シナリオ | source | fallback | 論点数 | 初期Frontier | 推定Round | depth | 警告 |`);
  out(`|---|---|---|---|---|---|---|---|`);
  for (const r of summary) {
    out(`| ${r.name} | ${r.source} | ${r.fallbackUsed} | ${r.nodes} | ${r.initialFrontierSize} | ${r.estimatedRounds} | ${r.maxDependencyDepth} | ${r.warnings} |`);
  }
  out();
  const llmCount = summary.filter((r) => r.source === "llm").length;
  out(`**fallbackUsed:false（実LLM生成）: ${llmCount} / ${summary.length} 件**`);
  out();
  if (llmCount < summary.length) {
    const reasons = summary.filter((r) => r.fallbackUsed).map((r) => r.fallbackReason || "unknown");
    const counts = {};
    for (const r of reasons) counts[r] = (counts[r] || 0) + 1;
    out(`> ⚠️ fallbackが含まれます。理由の内訳: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(", ")}`);
    out(`> 実LLM品質の評価には、全シナリオで fallbackUsed:false になる必要があります。`);
  }
  out();
  out(`### 評価の観点（Phase 5.2）`);
  out();
  out(`- Topic Specificity: 5topicのTree構造が互いに異なり、topic固有の論点になっているか`);
  out(`- Decision Relevance: 回答で設計・行動が実際に変わる質問か`);
  out(`- Fact/Decision分離: Facts Providerで分かることを質問していないか`);
  out(`- Dependency Quality: initialFrontierSize 2〜4 / maxDependencyDepth 3〜4程度 / 論点数に対しestimatedRoundsが過大でないか`);
  out(`- Recommendation: Session固有か（「ケースバイケース」等の一般論でないか）`);
  out(`- Round一貫性: 既回答を反映し、同じ質問を繰り返さないか`);
  out(`- Shared Understanding: Implementation Scope / Acceptance Criteria がそのまま実装指示に使える粒度か`);
  out();

  fs.writeFileSync(OUT, lines.join("\n"), "utf-8");
  console.log(`\n✅ レポートを書き出しました: ${OUT}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
