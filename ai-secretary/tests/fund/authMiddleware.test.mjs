/**
 * 未認証アクセス拒否テスト（docs/12_FUND_POLICY_ENGINE.md §19, §20）
 *
 * 実際の middleware.ts と app/lib/auth/session.ts をコンパイルして実行し、
 * - 未認証の /api/fund/* → 401
 * - 未認証の /fund → /login へリダイレクト
 * - 有効なセッションCookie → 通過
 * を検証する。scripts/test-fund.sh が事前に $FUND_DIST/mw へコンパイル済み。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const DIST =
  process.env.FUND_DIST ??
  new URL("../../.test-dist", import.meta.url).pathname;

const { middleware } = await import(pathToFileURL(`${DIST}/mw/middleware.js`).href);
const { createSessionToken, SESSION_COOKIE } = await import(
  pathToFileURL(`${DIST}/mw/session.js`).href
);
const { NextRequest } = await import(
  pathToFileURL(`${DIST}/mw/node_modules_next_server.js`).href
).catch(async () => {
  // 通常パス: リポジトリのnext本体から読み込む
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../package.json", import.meta.url));
  return require("next/server");
});

const SECRET = "test-secret-for-auth-check";

function makeRequest(path, cookieToken) {
  const req = new NextRequest(`http://localhost:3000${path}`);
  if (cookieToken) {
    req.cookies.set(SESSION_COOKIE, cookieToken);
  }
  return req;
}

test("未認証の /api/fund/* は 401 を返す", async () => {
  process.env.SESSION_SECRET = SECRET;
  for (const path of [
    "/api/fund/policy",
    "/api/fund/evaluate",
    "/api/fund/recommendations",
    "/api/fund/decisions",
    "/api/fund/reviews",
    "/api/fund/import",
    "/api/fund/allocation",
  ]) {
    const res = await middleware(makeRequest(path));
    assert.equal(res.status, 401, `${path} should be 401`);
  }
});

test("未認証の /fund 画面は /login へリダイレクトされる", async () => {
  process.env.SESSION_SECRET = SECRET;
  const res = await middleware(makeRequest("/fund"));
  assert.ok([302, 307].includes(res.status), `redirect expected, got ${res.status}`);
  const location = res.headers.get("location");
  assert.ok(location && location.includes("/login"), `location=${location}`);
});

test("SESSION_SECRET未設定でも未認証は拒否される（fail-close）", async () => {
  delete process.env.SESSION_SECRET;
  const res = await middleware(makeRequest("/api/fund/policy"));
  assert.equal(res.status, 401);
});

test("有効なセッションCookieがあれば通過する", async () => {
  process.env.SESSION_SECRET = SECRET;
  const token = await createSessionToken(SECRET);
  const res = await middleware(makeRequest("/api/fund/policy", token));
  // NextResponse.next() は200相当（x-middleware-nextヘッダー付き）
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-middleware-next"), "1");
});

test("改竄されたCookieは拒否される", async () => {
  process.env.SESSION_SECRET = SECRET;
  const token = await createSessionToken(SECRET);
  const tampered = token.slice(0, -4) + "AAAA";
  const res = await middleware(makeRequest("/api/fund/policy", tampered));
  assert.equal(res.status, 401);
});
