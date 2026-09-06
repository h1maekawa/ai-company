/**
 * 月次集計スナップショットの書式テスト。
 *
 * Slack日次と /kakei のキャッシュ縮退はこの往復に乗っているので、
 * 書式を変えたときに壊れることをここで検知する。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST =
  process.env.KAKEI_DIST ?? new URL("../../.test-dist", import.meta.url).pathname;
const { serializeSnapshot, parseSnapshot, snapshotPath } = await import(
  pathToFileURL(`${DIST}/snapshotFormat.js`).href
);

const sample = {
  month: "2026-09",
  syncedAt: "2026-09-06T10:00:00.000Z",
  currency: "JPY",
  totalSpent: 174800,
  income: { planned: 400000, actual: 400000 },
  fixed: { effective: 120000, unpaid: 30000 },
  variable: {
    budget: 100000,
    spent: 54800,
    remaining: 45200,
    dailyAllowance: 1808,
    daysLeft: 25,
    pace: 1.12,
  },
  byCategory: [
    { category: "食費", amount: 32000, count: 21, average: 1524 },
    { category: "娯楽", amount: 22800, count: 4, average: 5700 },
  ],
  needsReview: { count: 3, items: [] },
  appUrl: "https://example.test/transactions",
};

test("台帳ではなく月キーのファイルに書く", () => {
  assert.equal(snapshotPath("2026-09"), "memory/personal/kakei/2026-09.md");
});

test("整形して解析すると元の数字に戻る", () => {
  const parsed = parseSnapshot(serializeSnapshot(sample));
  assert.deepEqual(parsed, sample);
});

test("使いすぎでremainingがマイナスでも往復する", () => {
  const over = {
    ...sample,
    variable: { ...sample.variable, remaining: -8400, pace: 1.8 },
  };
  const parsed = parseSnapshot(serializeSnapshot(over));
  assert.equal(parsed.variable.remaining, -8400);
  assert.equal(parsed.variable.pace, 1.8);
});

test("内訳が空でも壊れない", () => {
  const empty = { ...sample, byCategory: [], needsReview: { count: 0, items: [] } };
  const parsed = parseSnapshot(serializeSnapshot(empty));
  assert.deepEqual(parsed.byCategory, []);
  assert.equal(parsed.needsReview.count, 0);
});

test("空文字は解析せずnullを返す", () => {
  assert.equal(parseSnapshot(""), null);
});

test("秘書が読む本文に今月あと使える額と要確認の導線が入る", () => {
  const md = serializeSnapshot(sample);
  assert.match(md, /今月あと使える: ¥45,200/);
  assert.match(md, /要確認: 3件/);
  assert.match(md, /https:\/\/example\.test\/transactions/);
});
