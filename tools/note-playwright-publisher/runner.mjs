/**
 * note投稿ローカルランナー（骨組み）。
 *
 * サーバーから承認済みジョブを1件受け取り、Playwrightでnoteを操作する。
 * 既定では「下書き保存まで」で必ず停止する。
 *
 * 認証情報（storageState）はこのディレクトリの .auth/ にだけ置き、
 * GitHubにもVaultにも保存しない。
 */

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(DIR, ".auth");
const STATE_PATH = path.join(AUTH_DIR, "storageState.json");
const SHOT_DIR = path.join(DIR, "screenshots");

/** 最初のN件は必ず下書き保存で止める */
const MAX_AUTO_RUNS = 10;
const RUN_COUNT_PATH = path.join(AUTH_DIR, "run-count.json");

const BASE = process.env.APP_BASE_URL;
const TOKEN = process.env.LOCAL_RUNNER_TOKEN;
const AUTOPUBLISH = process.env.NOTE_AUTOPUBLISH_ENABLED === "true";
const DRAFT_ONLY = process.env.NOTE_DRAFT_ONLY !== "false";

function assertConfig() {
  if (!BASE || !TOKEN) {
    console.error("APP_BASE_URL と LOCAL_RUNNER_TOKEN を .env に設定してください");
    process.exit(1);
  }
}

async function readRunCount() {
  try {
    return JSON.parse(await readFile(RUN_COUNT_PATH, "utf8")).count ?? 0;
  } catch {
    return 0;
  }
}

async function bumpRunCount() {
  const count = (await readRunCount()) + 1;
  await mkdir(AUTH_DIR, { recursive: true });
  await writeFile(RUN_COUNT_PATH, JSON.stringify({ count }), "utf8");
  return count;
}

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** 初回ログイン。手で操作してもらい、セッションだけ保存する */
export async function login() {
  await mkdir(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://note.com/login");
  console.log("ブラウザでログインしてください。完了したらこのターミナルで Enter を押します。");
  await new Promise((resolve) => process.stdin.once("data", resolve));

  await context.storageState({ path: STATE_PATH });
  console.log(`セッションを保存しました: ${STATE_PATH}`);
  await browser.close();
}

/** ジョブを1件処理する */
export async function runOnce() {
  assertConfig();

  if (!existsSync(STATE_PATH)) {
    console.error("ログインしていません。先に `npm run login` を実行してください。");
    process.exit(1);
  }

  const next = await api("/api/local-runner/note/jobs/next");
  if (next.status === 401) {
    console.error("認証に失敗しました。LOCAL_RUNNER_TOKEN を確認してください。");
    process.exit(1);
  }
  if (!next.body.job) {
    console.log(`処理するジョブはありません${next.body.reason ? `（${next.body.reason}）` : ""}`);
    return;
  }

  const { job, article, constraints } = next.body;
  const runCount = await readRunCount();

  // 下書き保存で止める条件（どれか1つでも当てはまれば公開しない）
  const draftOnly =
    DRAFT_ONLY ||
    !AUTOPUBLISH ||
    constraints?.draftOnly ||
    job.kind !== "note-publish" ||
    runCount < MAX_AUTO_RUNS;

  console.log(
    `ジョブ ${job.id} / ${article.title}\n` +
      `モード: ${draftOnly ? "下書き保存まで" : "公開"}（これまでの実行 ${runCount}回）`
  );

  await mkdir(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();
  const shots = [];

  try {
    await page.goto("https://note.com/notes/new", { waitUntil: "domcontentloaded" });

    const before = path.join(SHOT_DIR, `${job.id}-before.png`);
    await page.screenshot({ path: before, fullPage: true });
    shots.push(before);

    // note のエディタが期待通り出ているか。変わっていたら公開せず止める
    const editor = page.locator('[contenteditable="true"]').first();
    if ((await editor.count()) === 0) {
      throw Object.assign(new Error("エディタが見つかりません"), { uiChanged: true });
    }

    // TODO: noteのUIを確認しながら、タイトル・本文・見出し画像・タグ・有料設定を実装する。
    // 現段階では意図的に入力せず、下書き保存もしないまま「未実装」として失敗を報告する。
    throw Object.assign(new Error("入力処理は未実装です（Phase 4で実装予定）"), {
      unimplemented: true,
    });
  } catch (error) {
    const shot = path.join(SHOT_DIR, `${job.id}-error.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    shots.push(shot);

    await api(`/api/local-runner/note/jobs/${job.id}/fail`, {
      method: "POST",
      body: JSON.stringify({
        reason: error.message,
        uiChanged: Boolean(error.uiChanged),
        screenshotPaths: shots,
      }),
    });
    console.error(`失敗として報告しました: ${error.message}`);
  } finally {
    await bumpRunCount();
    await browser.close();
  }
}

const mode = process.argv[2];
if (mode === "login") await login();
else await runOnce();
