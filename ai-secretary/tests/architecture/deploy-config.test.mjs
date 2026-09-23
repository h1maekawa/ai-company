/**
 * デプロイ設定の契約テスト
 *
 * 背景（2026-09、実際に起きた事故）:
 *   vercel.json に1日1回より高頻度なcronを入れたところ、Vercelがデプロイ自体を拒否し、
 *   mainの本番デプロイが失敗した。`npm run build` はビルドを検証するだけで
 *   プラットフォーム側の設定検証は通らないため、ローカルでは一切検出できなかった。
 *   同じ事故を二度起こさないため、ここで設定を契約として固定する。
 *
 * プランを上げて高頻度cronが使えるようになったら、
 * このテストの ALLOW_SUBDAILY_CRON を true にすること（意図的な変更として残す）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

/** 現行プランは1日1回まで。プランを上げたらここを true にする */
const ALLOW_SUBDAILY_CRON = false;

/** cron式が「1日1回以下」か判定する（分・時が単一値なら1日1回） */
function isAtMostDaily(schedule) {
  const [minute, hour] = schedule.trim().split(/\s+/);
  const single = (field) => /^\d+$/.test(field);
  return single(minute) && single(hour);
}

test("vercel.json のcronが現行プランの制限（1日1回まで）に収まっている", () => {
  assert.ok(Array.isArray(vercel.crons), "crons が配列ではありません");

  const subDaily = vercel.crons.filter((c) => !isAtMostDaily(c.schedule));
  if (ALLOW_SUBDAILY_CRON) return;

  assert.deepEqual(
    subDaily,
    [],
    `1日1回より高頻度なcronはデプロイが拒否されます: ${subDaily
      .map((c) => `${c.path} (${c.schedule})`)
      .join(", ")}`
  );
});

test("cronのpathが実在するルートを指している", () => {
  for (const cron of vercel.crons) {
    const route = path.join(ROOT, "app", `${cron.path}`, "route.ts");
    assert.ok(
      fs.existsSync(route),
      `${cron.path} に対応する ${path.relative(ROOT, route)} がありません`
    );
  }
});

test("cronのpathが重複していない（同一pathの多重登録は二重実行になる）", () => {
  const seen = new Map();
  for (const cron of vercel.crons) {
    const schedules = seen.get(cron.path) ?? [];
    schedules.push(cron.schedule);
    seen.set(cron.path, schedules);
  }
  for (const [p, schedules] of seen) {
    // 同一pathを複数回登録すること自体は市場時間の分割などで正当だが、
    // 同じscheduleの重複は明確な事故なので落とす
    const unique = new Set(schedules);
    assert.equal(unique.size, schedules.length, `${p} に同じscheduleが重複しています`);
  }
});

test("X日次実行はResearchの10分後（07:10 JST）に固定する", () => {
  const research = vercel.crons.find(
    (entry) => entry.path === "/api/cron/note-daily-research"
  );
  const xPublish = vercel.crons.find(
    (entry) => entry.path === "/api/cron/x-daily-publish"
  );
  assert.equal(research?.schedule, "0 22 * * *");
  assert.equal(xPublish?.schedule, "10 22 * * *");
});

/**
 * Phase 10-B.1 Cadence Expansion（2026-09-15）
 *
 * Internal Autonomous Runtime は1日3回。頻度を変えるのは実行機会の数だけで、
 * 1 Cycleあたりの上限（maxMissionsPerCycle = 1）は別管理。
 */
const RUNTIME_CRON = "/api/cron/personal-company-runtime";
const runtimeSchedules = () =>
  vercel.crons.filter((cron) => cron.path === RUNTIME_CRON).map((cron) => cron.schedule);

test("Internal Autonomous Runtime は1日3回ちょうど登録されている", () => {
  assert.deepEqual([...runtimeSchedules()].sort(), ["15 11 * * *", "15 21 * * *", "15 4 * * *"].sort());
});

test("Runtime Healthのschedule表示が vercel.json と食い違わない", () => {
  // 表示が固定文字列なので、cronを足して表示を直し忘れると嘘を出し続ける
  const source = fs.readFileSync(path.join(ROOT, "app/lib/company/runtime/operations.ts"), "utf8");
  const shown = source.match(/nextScheduledRun:\s*"([^"]+)"/)?.[1] ?? "";
  for (const schedule of runtimeSchedules()) {
    const [minute, hour] = schedule.trim().split(/\s+/);
    const hhmm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    assert.ok(shown.includes(hhmm), `${hhmm} が Runtime Health の表示 "${shown}" に含まれていません`);
  }
});
