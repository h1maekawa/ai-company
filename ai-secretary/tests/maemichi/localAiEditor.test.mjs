import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const config = await import(path.join(DIST, "note/editor/config.js"));
const brandRules = await import(path.join(DIST, "note/editor/brandRules.js"));
const preservation = await import(path.join(DIST, "note/editor/preservation.js"));
const jobs = await import(path.join(DIST, "note/editor/jobs.js"));
const review = await import(path.join(DIST, "note/editor/review.js"));

const VALID_RULES = `
# まえみち ブランド・投稿生成ルール
ブランドの目的
実体験を捏造しない
投稿品質スコア
`;
const TEST_CONTEXT = { brandRules: VALID_RULES, verifiedExperiences: [] };

function input(overrides = {}) {
  return {
    destination: "both",
    purpose: "experience",
    originalText:
      "ChatGPTを3日間使いました。料金は1,000円でした。https://example.com を確認しました。",
    strength: "light",
    keepExpressions: ["焦らず、一歩ずつ。"],
    additionalFacts: ["焦らず、一歩ずつ。"],
    requestedBy: "U123",
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    revisedText:
      "ChatGPTを3日間使いました。料金は1,000円でした。https://example.com を確認しました。焦らず、一歩ずつ。",
    changes: ["読みやすく整理"],
    questions: [],
    score: {
      brandFit: 5,
      usefulness: 4,
      originality: 5,
      readability: 4,
      reliability: 5,
      total: 23,
    },
    preservedExpressions: ["焦らず、一歩ずつ。"],
    ...overrides,
  };
}

test("Local AIとクラウドfallbackは初期OFF", () => {
  const actual = config.getLocalAiEditorConfig({});
  assert.equal(actual.enabled, false);
  assert.equal(actual.provider, "ollama");
  assert.equal(actual.fallbackToCloud, false);
});

test("クラウドfallbackを有効にしようとすると停止する", () => {
  assert.throws(
    () =>
      config.getLocalAiEditorConfig({
        MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD: "true",
      }),
    /フォールバック/
  );
});

test("ブランド規則を読み込めない場合は停止する", () => {
  assert.throws(() => brandRules.validateBrandRules(""), /ブランド規則/);
  assert.throws(() => brandRules.validateBrandRules("# まえみち"), /必須項目/);
  assert.equal(brandRules.validateBrandRules(VALID_RULES), VALID_RULES.trim());
});

test("元文章にない数値を追加すると拒否する", () => {
  const issues = preservation.validatePreservation(
    input(),
    result({
      revisedText:
        "ChatGPTを30日間使いました。料金は1,000円でした。https://example.com を確認しました。焦らず、一歩ずつ。",
    })
  );
  assert.ok(issues.some((issue) => issue.field === "number" && issue.value === "30日"));
});

test("元文章にないURLを追加すると拒否する", () => {
  const issues = preservation.validatePreservation(
    input(),
    result({
      revisedText:
        "ChatGPTを3日間使いました。料金は1,000円でした。https://invalid.example を確認しました。焦らず、一歩ずつ。",
    })
  );
  assert.ok(issues.some((issue) => issue.field === "url"));
});

test("元文章にない英数字の固有表記を追加すると拒否する", () => {
  const issues = preservation.validatePreservation(
    input(),
    result({
      revisedText:
        "ChatGPTとGeminiを3日間使いました。料金は1,000円でした。https://example.com を確認しました。焦らず、一歩ずつ。",
    })
  );
  assert.ok(issues.some((issue) => issue.field === "identifier" && issue.value === "Gemini"));
});

test("残したい表現を削除すると拒否する", () => {
  const issues = preservation.validatePreservation(
    input(),
    result({ revisedText: "ChatGPTを3日間使いました。" })
  );
  assert.ok(issues.some((issue) => issue.field === "expression"));
});

test("25点評価の合計が不正なら拒否する", () => {
  const bad = result({ score: { ...result().score, total: 25 } });
  const issues = preservation.validatePreservation(input(), bad);
  assert.ok(issues.some((issue) => issue.field === "score"));
});

test("Local AIの構造化JSONを解析できる", () => {
  const parsed = review.parseLocalAiReviewResult(JSON.stringify(result()));
  assert.equal(parsed.revisedText, result().revisedText);
  assert.equal(parsed.score.total, 23);
});

test("Local AIの不完全な応答は拒否する", () => {
  assert.throws(() => review.parseLocalAiReviewResult("文章だけ"), /JSON/);
  assert.throws(() => review.parseLocalAiReviewResult('{"revisedText":"x"}'), /形式/);
});

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.lists = new Map();
    this.sorted = new Map();
  }
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async set(key, value) {
    this.values.set(key, structuredClone(value));
    return "OK";
  }
  async expire() {
    return 1;
  }
  async lpush(key, ...values) {
    const list = this.lists.get(key) ?? [];
    list.unshift(...values);
    this.lists.set(key, list);
    return list.length;
  }
  async rpop(key) {
    return (this.lists.get(key) ?? []).pop() ?? null;
  }
  async zadd(key, value) {
    const sorted = this.sorted.get(key) ?? new Map();
    sorted.set(value.member, value.score);
    this.sorted.set(key, sorted);
    return 1;
  }
  async zrange(key, min, max) {
    return [...(this.sorted.get(key) ?? new Map()).entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }
  async zrem(key, ...members) {
    const sorted = this.sorted.get(key) ?? new Map();
    let removed = 0;
    for (const member of members) removed += sorted.delete(member) ? 1 : 0;
    return removed;
  }
}

test("同じ添削ジョブを2つのWorkerが同時に取得しない", async () => {
  const redis = new FakeRedis();
  await jobs.createLocalAiReviewJob(input(), TEST_CONTEXT, redis);
  const first = await jobs.claimNextLocalAiReviewJob("worker-a", 300, redis);
  const second = await jobs.claimNextLocalAiReviewJob("worker-b", 300, redis);
  assert.equal(first?.status, "running");
  assert.equal(second, null);
});

test("claim tokenが一致するWorkerだけ完了報告できる", async () => {
  const redis = new FakeRedis();
  await jobs.createLocalAiReviewJob(input(), TEST_CONTEXT, redis);
  const claimed = await jobs.claimNextLocalAiReviewJob("worker-a", 300, redis);
  assert.ok(claimed?.claimToken);
  await assert.rejects(
    jobs.completeLocalAiReviewJob(claimed.id, "wrong-token", result(), redis),
    /claim/
  );
  const completed = await jobs.completeLocalAiReviewJob(
    claimed.id,
    claimed.claimToken,
    result(),
    redis
  );
  assert.equal(completed.status, "completed");
});

test("期限切れrunningジョブはpendingへ戻る", async () => {
  const redis = new FakeRedis();
  const created = await jobs.createLocalAiReviewJob(input(), TEST_CONTEXT, redis);
  await jobs.claimNextLocalAiReviewJob("worker-a", 1, redis);
  const count = await jobs.requeueExpiredLocalAiJobs(Date.now() + 2000, redis);
  assert.equal(count, 1);
  const reclaimed = await jobs.claimNextLocalAiReviewJob("worker-b", 300, redis);
  assert.equal(reclaimed?.id, created.id);
  assert.equal(reclaimed?.attempt, 2);
});

test("完了した添削だけ採用・却下できる", async () => {
  const redis = new FakeRedis();
  const created = await jobs.createLocalAiReviewJob(input(), TEST_CONTEXT, redis);
  await assert.rejects(jobs.decideLocalAiReviewJob(created.id, "adopted", redis));
  const claimed = await jobs.claimNextLocalAiReviewJob("worker-a", 300, redis);
  const completed = await jobs.completeLocalAiReviewJob(
    claimed.id,
    claimed.claimToken,
    result(),
    redis
  );
  const adopted = await jobs.decideLocalAiReviewJob(completed.id, "adopted", redis);
  assert.equal(adopted.status, "adopted");
  assert.ok(adopted.adoptedAt);
});
