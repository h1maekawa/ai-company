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
