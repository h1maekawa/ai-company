import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const urls = await import(path.join(DIST, "note/x/urls.js"));
const intents = await import(path.join(DIST, "note/x/web-intents.js"));
const archive = await import(path.join(DIST, "note/x/archive.js"));
const freeAi = await import(path.join(DIST, "note/x/free-ai.js"));

test("X個別URLはx.com/handle/status/idだけ許可する", () => {
  assert.equal(urls.parseXPostUrl("https://x.com/maemichi44/status/123456789")?.postId, "123456789");
  assert.equal(urls.parseXPostUrl("https://evil.example/a/status/123456789"), null);
  assert.equal(urls.parseXPostUrl("https://x.com/i/home"), null);
});
test("Web Intentは日本語・改行・URLを正しくencodeする", () => {
  const value = intents.buildXComposeIntent("こんにちは\n[PR]", "https://example.com/a");
  const parsed = new URL(value);
  assert.equal(parsed.origin, "https://twitter.com");
  assert.equal(parsed.searchParams.get("text"), "こんにちは\n[PR]");
  assert.equal(parsed.searchParams.get("url"), "https://example.com/a");
});
test("X文字数はUnicodeコードポイントで数える", () => assert.equal(intents.countXCharacters("あ😀"), 2));
test("oEmbed URLは公式publish.x.comだけを使う", () => {
  const value = new URL(urls.buildXOEmbedUrl("https://x.com/a/status/12345"));
  assert.equal(value.origin, "https://publish.x.com");
  assert.equal(value.searchParams.get("omit_script"), "true");
});
test("危険なoEmbed HTMLを拒否する", () => {
  assert.throws(() => urls.sanitizeXOEmbedHtml('<blockquote class="twitter-tweet"></blockquote><script>alert(1)</script>'));
  assert.throws(() => urls.sanitizeXOEmbedHtml('<blockquote class="twitter-tweet"><a href="https://evil.example">x</a></blockquote>'));
});
test("Xアーカイブは投稿だけ解析し未確認で開始する", () => {
  const posts = archive.parseXArchiveTweetsJs('window.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"本人投稿","created_at":"Mon Jan 01 00:00:00 +0000 2024"}}]');
  assert.equal(posts.length, 1); assert.equal(posts[0].verifiedByUser, false);
});
test("ZIP path traversalとDMファイルを除外する", () => {
  assert.equal(archive.isSafeArchiveEntry("../data/tweets.js"), false);
  assert.equal(archive.isTweetArchiveEntry("data/direct-messages.js"), false);
  assert.equal(archive.isTweetArchiveEntry("data/tweets.js"), true);
});
test("Ollama第一優先・有料fallback禁止", () => {
  assert.equal(freeAi.getXFreeAiConfig({}).order[0], "ollama");
  assert.throws(() => freeAi.getXFreeAiConfig({ AI_ALLOW_PAID_FALLBACK: "true" }));
  assert.throws(() => freeAi.getXFreeAiConfig({ AI_PROVIDER_ORDER: "gemini,ollama" }));
});
test("Geminiは明示した無料モデルだけ許可する", () => {
  const cfg = freeAi.getXFreeAiConfig({
    GEMINI_API_KEY: "test", GEMINI_MODEL: "free-model", GEMINI_FREE_MODELS: "free-model",
    AI_REQUIRE_FREE_TIER: "true",
  });
  assert.equal(cfg.geminiAllowed, true);
});
