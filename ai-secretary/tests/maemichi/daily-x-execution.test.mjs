import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const { executeDailyXPlan } = await import(path.join(DIST, "note/automation/dailyXExecution.js"));
const types = await import(path.join(DIST, "note/research/types.js"));
const queue = await import(path.join(DIST, "note/publishing/queue.js"));
const buffer = await import(path.join(DIST, "note/publishing/buffer.js"));

const NOW = new Date("2026-09-23T22:10:00Z"); // 2026-09-24 07:10 JST（cron時刻）
const PRIMARY = "acct-primary";
const cluster = (id, hotScore = 80) => ({ id, title: id, summary: "", genreIds: ["ai"], researchItemIds: [], matchedExperienceIds: [], totalScore: hotScore, hotScore, status: "candidate" });

/** 依存をすべてメモリ上のfakeにしたハーネス。呼び出し回数と保存状態を記録する */
function harness(options = {}) {
  const state = {
    now: options.now ?? NOW,
    plans: new Map((options.plans ?? []).map((plan) => [plan.id, structuredClone(plan)])),
    drafts: structuredClone(options.drafts ?? []),
    clusters: options.clusters ?? [cluster("c1", 90), cluster("c2", 80), cluster("c3", 70)],
    used: new Set(),
    claims: new Set(options.claims ?? []),
    counts: new Map(),
    history: [],
    calls: { generate: 0, createPost: 0, release: 0, markUsed: 0, slack: [], logs: [], postedDrafts: [] },
    fail: { ...(options.fail ?? {}) },
  };
  let postSeq = 0;
  const ctx = {
    accountKey: "primary", strategy: types.defaultContentGrowthStrategy(), maxXPostsPerDay: 3,
    autopilot: true, bufferConfigured: true, primaryAccountId: PRIMARY, ...(options.ctx ?? {}),
  };
  const deps = {
    now: () => state.now,
    loadPlan: async (date, accountKey) => structuredClone([...state.plans.values()].find((plan) => plan.date === date && plan.accountKey === accountKey) ?? null),
    savePlan: async (plan) => {
      if (state.fail.savePlanAlways) throw new Error("plan save failed");
      if (state.fail.savePlanWhenScheduled && plan.slots.some((slot) => slot.status === "scheduled")) { state.fail.savePlanWhenScheduled = false; throw new Error("plan save failed"); }
      if (state.fail.savePlanWhenStatus && plan.slots.some((slot) => slot.status === state.fail.savePlanWhenStatus)) { state.fail.savePlanWhenStatus = undefined; throw new Error("plan save failed"); }
      state.plans.set(plan.id, structuredClone(plan));
    },
    loadCandidates: async () => ({ eligibleCount: state.clusters.length, candidates: state.clusters }),
    findCluster: async (id) => state.clusters.find((item) => item.id === id) ?? null,
    markClustersUsed: async (ids) => { state.calls.markUsed++; ids.forEach((id) => state.used.add(id)); },
    generateForSlot: async (slot, source) => {
      state.calls.generate++;
      return { draft: { id: `draft-${slot.slotIndex}-${state.calls.generate}`, trendClusterId: source.id, xAccountId: options.accountFor?.(slot) ?? PRIMARY, purpose: slot.purpose, genreId: "ai", text: `本文${slot.slotIndex}`, urls: [], needsDisclosure: false, status: "draft", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() } };
    },
    safetyGate: async (draft) => (options.blockSlot !== undefined && draft.planSlotId?.endsWith(`:${options.blockSlot}`) ? { draft, safe: false, reasons: ["Fact Gate"] } : { draft, safe: true, reasons: [] }),
    loadDrafts: async () => structuredClone(state.drafts),
    saveDrafts: async (drafts) => {
      if (state.fail.saveDraftsWhenQueued && drafts.some((draft) => draft.status === "queued")) { state.fail.saveDraftsWhenQueued = false; throw new Error("draft save failed"); }
      state.drafts = structuredClone(drafts);
    },
    claimStrict: async (key) => {
      if (state.fail.claimUnavailable) return "unavailable";
      if (state.claims.has(key)) return "duplicate";
      state.claims.add(key);
      return "claimed";
    },
    releaseClaim: async (key) => { state.calls.release++; state.claims.delete(key); },
    countForTokyoDate: async (date) => (state.fail.countUnavailable ? "unavailable" : state.counts.get(date) ?? 0),
    incrementForTokyoDate: async (date) => {
      if (state.fail.incrementOnce) { state.fail.incrementOnce = false; throw new Error("count failed"); }
      state.counts.set(date, (state.counts.get(date) ?? 0) + 1);
    },
    createPost: async (draft, scheduledAt) => {
      state.calls.createPost++;
      state.calls.postedDrafts.push(draft.id);
      const planned = options.createPost?.(draft, state.calls.createPost);
      if (planned) return planned;
      postSeq++;
      return { ok: true, data: { id: `buf-${postSeq}`, dueAt: scheduledAt, draft: { ...draft, text: `${draft.text}（修復済み）` }, repaired: true } };
    },
    appendHistory: async (entry) => { state.history.push(entry); },
    notifySlack: async (text) => { state.calls.slack.push(text); return { ok: true }; },
    logError: (message, detail) => { state.calls.logs.push({ message, detail }); },
  };
  return { state, ctx, deps, run: () => executeDailyXPlan(ctx, deps), plan: () => [...state.plans.values()][0] };
}

const statuses = (plan) => plan.slots.map((slot) => slot.status);

test("T1 same day retry: 全slot予約後の2回目は生成・createPost 0回、Draft件数不変", async () => {
  const h = harness();
  const first = await h.run();
  assert.deepEqual(statuses(h.plan()), ["scheduled", "scheduled", "scheduled"]);
  assert.equal(first.scheduledDraftIds.length, 3);
  const draftCount = h.state.drafts.length;
  const generate = h.state.calls.generate; const posts = h.state.calls.createPost;
  const second = await h.run();
  assert.equal(h.state.calls.generate, generate);
  assert.equal(h.state.calls.createPost, posts);
  assert.equal(h.state.drafts.length, draftCount);
  assert.equal(second.planId, first.planId);
});

test("T2 partial retry: scheduled は触らず、failed は既存Draftで再予約、planned だけ生成", async () => {
  const h0 = harness();
  await h0.run();
  const plan = structuredClone(h0.plan());
  plan.slots[1].status = "failed"; plan.slots[1].failureKind = "rate-limit"; delete plan.slots[1].bufferPostId;
  plan.slots[2].status = "planned"; delete plan.slots[2].draftId; delete plan.slots[2].bufferPostId;
  const drafts = h0.state.drafts.map((draft) => (draft.id === plan.slots[1].draftId ? { ...draft, status: "draft", bufferPostId: undefined } : draft)).filter((draft) => draft.planSlotId !== plan.slots[2].id);
  const h = harness({ plans: [plan], drafts, claims: [plan.slots[0].id] });
  const slot0Before = structuredClone(plan.slots[0]);
  await h.run();
  assert.equal(h.state.calls.generate, 1, "slot2だけ生成");
  assert.equal(h.state.calls.createPost, 2, "slot1とslot2");
  assert.deepEqual(statuses(h.plan()), ["scheduled", "scheduled", "scheduled"]);
  assert.equal(h.plan().slots[1].draftId, plan.slots[1].draftId, "slot1は既存Draftを再利用");
  assert.deepEqual(h.plan().slots[0], slot0Before, "slot0は変更しない");
});

test("T4 plan immutability: Plan保存後にStrategyを変えても当日Planは不変", async () => {
  const h = harness({ ctx: { autopilot: false } });
  await h.run();
  const before = structuredClone(h.plan());
  h.ctx.strategy = { ...types.defaultContentGrowthStrategy(), explorationRate: 30, purposeMix: { reach: 50, noteBridge: 30, monetize: 20 }, topicPriority: ["c3"] };
  await h.run();
  const after = h.plan();
  assert.deepEqual(after.strategySnapshot, before.strategySnapshot);
  assert.deepEqual(after.slots.map(({ purpose, exploration, candidateRef, scheduledAt }) => ({ purpose, exploration, candidateRef, scheduledAt })), before.slots.map(({ purpose, exploration, candidateRef, scheduledAt }) => ({ purpose, exploration, candidateRef, scheduledAt })));
});

test("REVIEW / DRAFT: 生成まで行い、Buffer予約へ進まない", async () => {
  const h = harness({ ctx: { autopilot: false } });
  const result = await h.run();
  assert.equal(h.state.calls.createPost, 0);
  assert.deepEqual(statuses(h.plan()), ["generated", "generated", "generated"]);
  assert.equal(result.generated, 3);
});

test("T10 strict count: 日次カウントを確認できなければ予約しない（fail-closed）", async () => {
  const h = harness({ fail: { countUnavailable: true } });
  const result = await h.run();
  assert.equal(h.state.calls.createPost, 0);
  assert.equal(result.haltedReason, "daily-count-unavailable");
  assert.equal(result.escalated, true);
  assert.equal(await queue.countForTokyoDate("x", "2026-09-24", { strict: true }), "unavailable", "Redis未設定はunavailable（0扱いしない）");
  assert.equal(await queue.claimStrict("daily-x:2026-09-24:primary:0"), "unavailable", "claimもfail-closed");
});

test("T11 past slot: 予定時刻-5分を過ぎたslotは missed。scheduledAtは変えず翌日キーのclaimを取らない", async () => {
  const h0 = harness({ ctx: { autopilot: false } });
  await h0.run();
  const plan = h0.plan();
  const h = harness({ plans: [plan], drafts: h0.state.drafts, now: new Date("2026-09-24T03:12:00Z") }); // 12:12 JST
  await h.run();
  const after = h.plan();
  assert.deepEqual(statuses(after), ["missed", "missed", "scheduled"]);
  assert.deepEqual(after.slots.map((slot) => slot.scheduledAt), plan.slots.map((slot) => slot.scheduledAt));
  assert.deepEqual([...h.state.claims], ["daily-x:2026-09-24:primary:2"], "翌日キーを先取りしない");
});

for (const kind of ["slot-limit", "validation", "auth", "mutation"]) {
  test(`T12 Buffer known failure（${kind}）: claimを解放し slot failed、次回実行で再予約`, async () => {
    const h = harness({ ctx: { maxXPostsPerDay: 1 }, createPost: (_draft, call) => (call === 1 ? { ok: false, error: { kind, message: `${kind} error` } } : null) });
    await h.run();
    assert.equal(h.plan().slots[0].status, "failed");
    assert.equal(h.plan().slots[0].failureKind, kind);
    assert.equal(h.state.calls.release, 1);
    assert.equal(h.state.claims.size, 0);
    await h.run();
    assert.equal(h.state.calls.createPost, 2, "次回実行で再予約");
    assert.equal(h.plan().slots[0].status, "scheduled");
  });
}

for (const [label, error] of [["fetch例外", { kind: "ambiguous", message: "fetch failed" }], ["タイムアウト", { kind: "ambiguous", message: "The operation was aborted due to timeout" }], ["5xx", { kind: "ambiguous", message: "502" }], ["JSON解析失敗", { kind: "ambiguous", message: "parse" }]]) {
  test(`T13 Buffer ambiguous（${label}）: slot ambiguous・claim保持・Slack・次回createPost 0回`, async () => {
    const h = harness({ createPost: () => ({ ok: false, error }) });
    const result = await h.run();
    assert.equal(h.plan().slots[0].status, "ambiguous");
    assert.equal(h.state.calls.release, 0);
    assert.ok(h.state.claims.has(h.plan().slots[0].id), "claim保持");
    assert.ok(h.state.calls.slack.length >= 1);
    assert.equal(result.escalated, true);
    const posts = h.state.calls.createPost;
    await h.run();
    assert.equal(h.state.calls.createPost, posts, "ambiguousは自動retryしない");
  });
}

test("T13b Bufferのエラー分類: 通信例外・5xx・JSON不正・IDなしは ambiguous、401 / 429 / GraphQL error は既知失敗", async () => {
  process.env.BUFFER_API_KEY = "k"; process.env.BUFFER_ORGANIZATION_ID = "o"; process.env.BUFFER_X_CHANNEL_ID = "c";
  const draft = { id: "d", xAccountId: PRIMARY, purpose: "reach", genreId: "ai", text: "安全な投稿です", urls: [], needsDisclosure: false, status: "draft" };
  const safetyContext = { brand: { personality: { avoidedExpressions: [] } }, experiences: [] };
  const original = global.fetch;
  const cases = [
    [async () => { throw new Error("socket hang up"); }, "ambiguous"],
    [async () => new Response("oops", { status: 502 }), "ambiguous"],
    [async () => new Response("not json", { status: 200 }), "ambiguous"],
    [async () => new Response(JSON.stringify({ data: { createPost: { post: {} } } }), { status: 200 }), "ambiguous"],
    [async () => new Response("", { status: 401 }), "auth"],
    [async () => new Response("", { status: 429 }), "rate-limit"],
    [async () => new Response(JSON.stringify({ errors: [{ message: "invalid input" }] }), { status: 200 }), "mutation"],
    [async () => new Response(JSON.stringify({ data: { createPost: { message: "rejected" } } }), { status: 200 }), "mutation"],
  ];
  try {
    for (const [impl, expected] of cases) {
      global.fetch = impl;
      const result = await buffer.createPost({ draft, safetyContext, mode: "customScheduled", scheduledAt: "2026-09-24T03:15:00.000Z" });
      assert.equal(result.ok, false);
      assert.equal(result.error.kind, expected);
      assert.equal(buffer.isAmbiguousBufferError(result.error), expected === "ambiguous");
    }
  } finally { global.fetch = original; }
});

test("T14 claim unavailable: 予約を中止してescalate", async () => {
  const h = harness({ fail: { claimUnavailable: true } });
  const result = await h.run();
  assert.equal(h.state.calls.createPost, 0);
  assert.equal(result.haltedReason, "claim-unavailable");
  assert.equal(result.escalated, true);
});

test("T15 countScheduled failure: maxScheduled指定時に枠を確認できなければ slot-limit で拒否（送信しない）", async () => {
  process.env.BUFFER_API_KEY = "k"; process.env.BUFFER_ORGANIZATION_ID = "o"; process.env.BUFFER_X_CHANNEL_ID = "c";
  const draft = { id: "d", xAccountId: PRIMARY, purpose: "reach", genreId: "ai", text: "安全な投稿です", urls: [], needsDisclosure: false, status: "draft" };
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("network down"); };
  try {
    const result = await buffer.createPost({ draft, safetyContext: { brand: { personality: { avoidedExpressions: [] } }, experiences: [] }, mode: "customScheduled", scheduledAt: "2026-09-24T03:15:00.000Z", maxScheduled: 7 });
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, "slot-limit");
    assert.match(result.error.message, /予約枠を確認できません/);
    assert.equal(calls, 1, "countScheduledだけ呼び、createPostは送らない");
  } finally { global.fetch = original; }
});

test("T16 repaired text: 予約成功時 draft.text は createPost が返した修復後本文", async () => {
  const h = harness({ ctx: { maxXPostsPerDay: 1 } });
  await h.run();
  const draft = h.state.drafts.find((item) => item.id === h.plan().slots[0].draftId);
  assert.equal(draft.text, "本文0（修復済み）");
  assert.equal(draft.status, "queued");
  assert.equal(draft.bufferPostId, "buf-1");
  assert.equal(draft.scheduledAt, h.plan().slots[0].scheduledAt);
});

test("T21 lineage: 生成Draftに planId / planSlotId / exploration / strategySnapshot", async () => {
  const h = harness({ ctx: { autopilot: false } });
  await h.run();
  for (const slot of h.plan().slots) {
    const draft = h.state.drafts.find((item) => item.id === slot.draftId);
    assert.equal(draft.planId, h.plan().id);
    assert.equal(draft.planSlotId, slot.id);
    assert.equal(draft.exploration, slot.exploration);
    assert.deepEqual(draft.strategySnapshot.purposeMix, h.plan().strategySnapshot.purposeMix);
    assert.equal(draft.strategySnapshot.explorationRate, h.plan().strategySnapshot.explorationRate);
    assert.equal("experimentId" in draft, false);
    assert.equal("sourceArtifactIds" in draft, false);
  }
});

for (const [label, fail] of [["Plan保存", { savePlanWhenScheduled: true }], ["Draft保存", { saveDraftsWhenQueued: true }], ["count更新", { incrementOnce: true }]]) {
  test(`T22 persistence after publish（${label}失敗）: claim保持・createPost 1回・escalate・ログにbufferPostId、次回0回`, async () => {
    const h = harness({ fail });
    const result = await h.run();
    assert.equal(h.state.calls.createPost, 1, "同一実行で blind retry しない");
    assert.equal(h.state.calls.release, 0);
    assert.equal(result.escalated, true);
    assert.equal(result.haltedReason, "persistence-after-publish");
    assert.equal(result.persistenceAfterPublishFailures[0].bufferPostId, "buf-1");
    const log = h.state.calls.logs.find((entry) => /persistence-after-publish/.test(entry.message));
    assert.equal(log.detail.bufferPostId, "buf-1");
    assert.ok(log.detail.planSlotId && log.detail.draftId && log.detail.scheduledAt);
    assert.doesNotMatch(JSON.stringify(log.detail), /本文/, "本文はログに出さない");
    assert.match(h.state.calls.slack.join("\n"), /bufferPostId=buf-1/);
    const postedSlot0 = h.state.calls.postedDrafts[0];
    await h.run();
    assert.equal(h.state.calls.postedDrafts.filter((id) => id === postedSlot0).length, 1, "同じslotを次回実行で再予約しない");
    if (fail.savePlanWhenScheduled) assert.equal(h.state.calls.createPost, 1, "Plan未保存（claim残存）なら人間確認まで他slotも予約しない");
  });
}

test("T23 primary account guard: primary以外のDraftは予約せず skipped、Draftは保持", async () => {
  const h = harness({ accountFor: (slot) => (slot.slotIndex === 1 ? "acct-other" : PRIMARY) });
  await h.run();
  const slot = h.plan().slots[1];
  assert.equal(slot.status, "skipped");
  assert.equal(slot.failureKind, "non-primary-account");
  assert.ok(h.state.drafts.some((draft) => draft.id === slot.draftId && draft.status === "draft"));
  assert.equal(h.state.calls.createPost, 2);
});

test("T24 cluster used: Plan保存失敗時はused化しない。Plan保存後はunique clusterだけ、再実行してもidempotent", async () => {
  const failing = harness({ fail: { savePlanAlways: true } });
  await assert.rejects(failing.run());
  assert.equal(failing.state.calls.markUsed, 0);
  const h = harness({ clusters: [cluster("only", 50)], ctx: { autopilot: false } });
  await h.run();
  assert.deepEqual([...h.state.used], ["only"]);
  await h.run();
  assert.deepEqual([...h.state.used], ["only"]);
  assert.equal(h.state.calls.markUsed, 2, "再利用時も同じ処理を通して回復できる");
});

test("T25a halt: slot0成功後にcount更新失敗 → slot1/2 は createPost 0回・状態不変・escalate", async () => {
  const h = harness({ fail: { incrementOnce: true } });
  await h.run();
  assert.equal(h.state.calls.createPost, 1);
  assert.deepEqual(statuses(h.plan()), ["scheduled", "generated", "generated"]);
});

test("T25b/c halt: slot0 ambiguous → 以降0回。ambiguousが残る間は次回Runも他slotを予約しない（生成は可）", async () => {
  const h = harness({ createPost: (_draft, call) => (call === 1 ? { ok: false, error: { kind: "ambiguous", message: "timeout" } } : null) });
  const first = await h.run();
  assert.equal(h.state.calls.createPost, 1);
  assert.deepEqual(statuses(h.plan()), ["ambiguous", "generated", "generated"]);
  assert.equal(first.haltedReason, "buffer-ambiguous");
  const second = await h.run();
  assert.equal(h.state.calls.createPost, 1);
  assert.equal(second.haltedReason, "ambiguous-slot-pending");
  // 人間がambiguousを解消すると再開する
  const resolved = structuredClone(h.plan());
  resolved.slots[0].status = "scheduled"; resolved.slots[0].bufferPostId = "buf-manual";
  h.state.plans.set(resolved.id, resolved);
  await h.run();
  assert.deepEqual(statuses(h.plan()), ["scheduled", "scheduled", "scheduled"]);
});

test("T25d halt: claimが残っているのにslotがgenerated（前回の永続化失敗）なら予約停止・escalate", async () => {
  const h0 = harness({ ctx: { autopilot: false } });
  await h0.run();
  const plan = h0.plan();
  const h = harness({ plans: [plan], drafts: h0.state.drafts, claims: [plan.slots[0].id] });
  const result = await h.run();
  assert.equal(h.state.calls.createPost, 0);
  assert.equal(result.haltedReason, "claim-duplicate-unscheduled");
  assert.equal(result.escalated, true);
});

test("日次上限に達したら残りslotを skipped", async () => {
  const h = harness({ ctx: { maxXPostsPerDay: 3 } });
  h.state.counts.set("2026-09-24", 2);
  await h.run();
  assert.equal(h.state.calls.createPost, 1);
  assert.deepEqual(statuses(h.plan()), ["scheduled", "skipped", "skipped"]);
});

test("Safety/Fact Gate不合格は blocked（当日は再生成しない）", async () => {
  const h = harness({ blockSlot: 1 });
  const result = await h.run();
  assert.equal(h.plan().slots[1].status, "blocked");
  assert.equal(result.safetyBlocked, 1);
  assert.equal(result.escalated, true);
  const generate = h.state.calls.generate;
  await h.run();
  assert.equal(h.state.calls.generate, generate);
});

test("T27a generation persistence recovery: Draft保存成功・Plan保存失敗 → 次回は再生成せずgeneratedへ回復", async () => {
  const h = harness({ ctx: { maxXPostsPerDay: 1, autopilot: false }, fail: { savePlanWhenStatus: "generated" } });
  await assert.rejects(h.run());
  assert.equal(h.plan().slots[0].status, "planned", "Planはplannedのまま");
  const saved = h.state.drafts.find((draft) => draft.planSlotId === h.plan().slots[0].id);
  assert.ok(saved, "Draftは保存済み");
  const text = saved.text;
  const generate = h.state.calls.generate;
  await h.run();
  assert.equal(h.state.calls.generate, generate, "LLM再生成0回");
  assert.equal(h.plan().slots[0].status, "generated");
  assert.equal(h.plan().slots[0].draftId, saved.id);
  assert.equal(h.state.drafts.filter((draft) => draft.planSlotId === h.plan().slots[0].id).length, 1);
  assert.equal(h.state.drafts.find((draft) => draft.id === saved.id).text, text, "本文を変更しない");
});

test("T27a' 回復したDraftは通常フローで予約される（autopilot）", async () => {
  const h = harness({ ctx: { maxXPostsPerDay: 1 }, fail: { savePlanWhenStatus: "generated" } });
  await assert.rejects(h.run());
  const saved = h.state.drafts.find((draft) => draft.planSlotId === h.plan().slots[0].id);
  await h.run();
  assert.equal(h.state.calls.generate, 1);
  assert.deepEqual(h.state.calls.postedDrafts, [saved.id]);
  assert.equal(h.plan().slots[0].status, "scheduled");
});

test("T27b Safety不合格Draft保存成功・blocked保存失敗 → 次回は生成0回でblockedへ回復、createPost 0回", async () => {
  const h = harness({ ctx: { maxXPostsPerDay: 1 }, blockSlot: 0, fail: { savePlanWhenStatus: "blocked" } });
  await assert.rejects(h.run());
  const saved = h.state.drafts.find((draft) => draft.planSlotId === h.plan().slots[0].id);
  assert.ok(saved.failureReason);
  await h.run();
  assert.equal(h.state.calls.generate, 1);
  assert.equal(h.plan().slots[0].status, "blocked");
  assert.equal(h.plan().slots[0].failureKind, "safety-gate");
  assert.equal(h.plan().slots[0].draftId, saved.id);
  assert.equal(h.state.calls.createPost, 0);
});

test("T27c 同じplanSlotIdのDraftが複数 → 1件を選ばず自動予約しない・Human Escalation", async () => {
  const h0 = harness({ ctx: { autopilot: false } });
  await h0.run();
  const plan = structuredClone(h0.plan());
  const slot = plan.slots[0];
  const original = h0.state.drafts.find((draft) => draft.id === slot.draftId);
  slot.status = "planned"; delete slot.draftId;
  const drafts = [...h0.state.drafts, { ...original, id: "duplicate-draft" }];
  const h = harness({ plans: [plan], drafts });
  const result = await h.run();
  assert.equal(h.state.calls.generate, 0, "再生成もしない");
  assert.equal(h.plan().slots[0].status, "skipped");
  assert.equal(h.plan().slots[0].failureKind, "duplicate-lineage");
  assert.ok(!h.state.calls.postedDrafts.includes(original.id) && !h.state.calls.postedDrafts.includes("duplicate-draft"), "どちらもpublishしない");
  assert.equal(result.escalated, true);
  assert.match(h.state.calls.slack.join("\n"), /同じslotのDraftが複数/);
});
