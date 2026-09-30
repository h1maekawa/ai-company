import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHmac } from "node:crypto";

function load(path, imports, globals = {}) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => imports[name], console, Buffer, Date, URL, URLSearchParams, AbortSignal, process, ...globals });
  return exports;
}

test("Flow event rejects missing secret, stale timestamp and altered body", () => {
  const event = { event: "card_transaction.created", transactionId: "tx-1", date: "2026-09-30", merchant: "Shop", amount: 4980, card: "Card", raw_email: "must be dropped" };
  const raw = JSON.stringify(event);
  const timestamp = String(Date.now());
  const secret = "test-only-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const code = load("app/lib/finance/flowEvents.ts", { "server-only": {}, "node:crypto": { createHmac, timingSafeEqual: (a, b) => a.equals(b) } });
  assert.equal(code.verifyFlowSignature(raw, timestamp, signature, secret), true);
  assert.equal(code.verifyFlowSignature(raw, timestamp, signature, undefined), false);
  assert.equal(code.verifyFlowSignature(raw + " ", timestamp, signature, secret), false);
  assert.equal(code.verifyFlowSignature(raw, String(Date.now() - 600_000), signature, secret), false);
  assert.equal(code.parseFlowCardEvent(raw).raw_email, undefined);
  assert.equal(code.flowEventFingerprint(code.parseFlowCardEvent(raw)), "flow:card_transaction:tx-1");
});

test("Flow client forwards server token and marks cached values stale on outage", async () => {
  const original = { FLOW_FINANCE_BASE_URL: process.env.FLOW_FINANCE_BASE_URL, FLOW_FINANCE_INTEGRATION_TOKEN: process.env.FLOW_FINANCE_INTEGRATION_TOKEN };
  process.env.FLOW_FINANCE_BASE_URL = "https://flow.example";
  process.env.FLOW_FINANCE_INTEGRATION_TOKEN = "test-token";
  let fail = false;
  const calls = [];
  const code = load("app/lib/finance/flowClient.ts", { "server-only": {} }, { fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw new Error("offline");
    return { ok: true, json: async () => ({ month: "2026-09", assets: { total: 100 } }) };
  } });
  try {
    const fresh = await code.flowFinanceSummary("2026-09");
    assert.equal(fresh.data.assets.total, 100);
    assert.equal(calls[0].options.headers["x-import-secret"], "test-token");
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(JSON.stringify(fresh).includes("test-token"), false);
    fail = true;
    const stale = await code.flowCardActivity("2026-09", 20);
    assert.equal(stale.stale, true);
    assert.equal(stale.data, null);
  } finally {
    for (const [name, value] of Object.entries(original)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test("signed duplicate card event sends one notification through durable claim", async () => {
  const previous = { secret: process.env.FLOW_EVENT_SECRET, channel: process.env.FLOW_EVENT_NOTIFY_CHANNEL };
  process.env.FLOW_EVENT_SECRET = "test-only-secret";
  process.env.FLOW_EVENT_NOTIFY_CHANNEL = "slack";
  const helpers = load("app/lib/finance/flowEvents.ts", { "server-only": {}, "node:crypto": { createHmac, timingSafeEqual: (a, b) => a.equals(b) } });
  const results = new Map();
  let sends = 0;
  const store = {
    getIdempotencyResult: async (_scope, key) => results.get(key) ?? null,
    claimIdempotency: async (_scope, key) => !results.has(key),
    completeIdempotency: async (_scope, key, result) => results.set(key, result),
  };
  const route = load("app/api/integrations/flow/events/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/app/lib/company/execution/store": { getExecutionStore: () => store },
    "@/app/lib/finance/flowEvents": helpers,
    "@/app/lib/integrations/slack/blocks": { postToSlack: async () => { sends++; return { ok: true }; } },
  });
  const raw = JSON.stringify({ event: "card_transaction.created", transactionId: "tx-2", date: "2026-09-30", merchant: "Shop", amount: 100, card: "Card" });
  const timestamp = String(Date.now());
  const signature = `sha256=${createHmac("sha256", process.env.FLOW_EVENT_SECRET).update(`${timestamp}.${raw}`).digest("hex")}`;
  const request = () => ({ headers: { get: (name) => ({ "x-flow-timestamp": timestamp, "x-flow-signature": signature }[name] ?? null) }, text: async () => raw });
  try {
    const first = await route.POST(request());
    const second = await route.POST(request());
    assert.equal(first.status, 202);
    assert.equal(second.body.duplicate, true);
    assert.equal(sends, 1);
  } finally {
    previous.secret === undefined ? delete process.env.FLOW_EVENT_SECRET : process.env.FLOW_EVENT_SECRET = previous.secret;
    previous.channel === undefined ? delete process.env.FLOW_EVENT_NOTIFY_CHANNEL : process.env.FLOW_EVENT_NOTIFY_CHANNEL = previous.channel;
  }
});

test("Assets proxies require session and Flow event uses exact machine-route exemption", () => {
  for (const route of ["app/api/assets/summary/route.ts", "app/api/assets/card-activity/route.ts"]) {
    assert.match(fs.readFileSync(route, "utf8"), /requireFinanceSession\(request\)/);
  }
  const proxy = fs.readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /pathname === "\/api\/integrations\/flow\/events"/);
  assert.doesNotMatch(fs.readFileSync("app/assets/AssetsDashboard.tsx", "utf8"), /FLOW_FINANCE_INTEGRATION_TOKEN|x-import-secret/);
});
