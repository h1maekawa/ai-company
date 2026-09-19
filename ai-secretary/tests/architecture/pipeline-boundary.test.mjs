/**
 * Server / Client 境界の固定 — 要件7 follow-up
 *
 * pipelineTypes.ts（型・集計・fs非依存）と pipeline.ts（Vault/fs、Server専用）を
 * 分けているのは、クライアントコンポーネントが fs 依存を巻き込むとビルドが
 * 落ちるため。一度落ちてから分離した経緯がある。
 *
 * 分離しただけでは、再exportや自動importで簡単に元へ戻る。
 * 境界をソースの静的検査として固定し、戻ったらCIで落とす。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const PIPELINE = "app/lib/review/pipeline.ts";
const PIPELINE_TYPES = "app/lib/review/pipelineTypes.ts";

/** app/ と components/ 配下の .ts / .tsx を全部集める */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(rel));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const files = [...sourceFiles("app"), ...sourceFiles("components")].map((rel) => ({
  rel,
  src: read(rel),
}));

/** "use client" が先頭にあるファイル（Client Component） */
const clientFiles = files.filter((file) => /^\s*["']use client["']/m.test(file.src));

/** pipeline.ts からの import（pipelineTypes は別モジュールなので末尾の引用符で区別する） */
const IMPORTS_PIPELINE = /from\s+["']@\/app\/lib\/review\/pipeline["']/;

test("Client Component は pipeline.ts を import しない", () => {
  assert.ok(clientFiles.length > 0, "Client Component を1つも検出できていない");

  const offenders = clientFiles
    .filter((file) => IMPORTS_PIPELINE.test(file.src))
    .map((file) => file.rel);

  assert.deepEqual(
    offenders,
    [],
    `pipeline.ts は Server専用。型や集計は pipelineTypes.ts から取ること: ${offenders.join(", ")}`
  );
});

test("pipeline.ts は pipelineTypes.ts の中身を再exportしない", () => {
  // 再exportがあると、自動importが pipeline.ts を選んで fs を巻き込む
  const src = read(PIPELINE);
  assert.doesNotMatch(
    src,
    /export\s*(type\s*)?\{[^}]*\}\s*from\s*["']\.\/pipelineTypes["']/,
    "pipeline.ts が pipelineTypes.ts を再exportしている"
  );
});

test("pipeline.ts が公開するのは loadPipeline だけ", () => {
  const src = read(PIPELINE);
  const exported = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(exported, ["loadPipeline"]);
});

test("pipelineTypes.ts は I/O を持たない", () => {
  const src = read(PIPELINE_TYPES);
  // fs・Vault・ストアに触れた時点でクライアントから使えなくなる
  assert.doesNotMatch(src, /from\s+["']node:/, "Node組み込みモジュールを import している");
  assert.doesNotMatch(src, /from\s+["']fs["']|require\(["']fs["']\)/, "fs を import している");
  assert.doesNotMatch(src, /\.\/feed["']|agents\/store["']/, "Vault/ストアに触っている");
  assert.doesNotMatch(src, /process\.env/, "環境変数を読んでいる");
});

test("滞留の閾値と判定は pipelineTypes.ts にしか無い", () => {
  // 画面ごとに違う基準で「滞留」が出ると、表示そのものが信用されなくなる
  const offenders = files
    .filter((file) => file.rel !== PIPELINE_TYPES)
    .filter((file) => /const\s+STALE_HOURS|function\s+isStale/.test(file.src))
    .map((file) => file.rel);

  assert.deepEqual(offenders, [], `滞留の判定を持っているファイル: ${offenders.join(", ")}`);
});
