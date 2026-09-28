import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const client = await import(path.join(DIST, "ai/client.js"));
const errors = await import(path.join(DIST, "ai/errors.js"));

test("autoはGemini rate limit時だけGroqへ1回fallbackする", async () => {
  let geminiCalls = 0;
  let groqCalls = 0;
  const result = await client.callAutoWithRateLimitFallback({
    hasGemini: true, hasGroq: true, isVercel: true,
    gemini: async () => { geminiCalls += 1; throw new errors.AIRateLimitError(); },
    groq: async () => { groqCalls += 1; return "groq-ok"; },
    ollama: async () => "ollama",
  });
  assert.equal(result, "groq-ok");
  assert.equal(geminiCalls, 1);
  assert.equal(groqCalls, 1);
});

test("autoはrate_limited reason codeでもGroqへfallbackする", async () => {
  let groqCalls = 0;
  const result = await client.callAutoWithRateLimitFallback({
    hasGemini: true, hasGroq: true, isVercel: true,
    gemini: async () => { throw new errors.AIProviderError("rate_limited"); },
    groq: async () => { groqCalls += 1; return "groq-ok"; },
    ollama: async () => "ollama",
  });
  assert.equal(result, "groq-ok");
  assert.equal(groqCalls, 1);
});

test("autoはGeminiのrate limit以外をfallbackしない", async () => {
  let groqCalls = 0;
  await assert.rejects(() => client.callAutoWithRateLimitFallback({
    hasGemini: true, hasGroq: true, isVercel: true,
    gemini: async () => { throw new Error("provider failure"); },
    groq: async () => { groqCalls += 1; return "unexpected"; },
    ollama: async () => "ollama",
  }), /provider failure/);
  assert.equal(groqCalls, 0);
});

test("autoでもGROQ_API_KEY相当が無ければrate limitをそのまま返す", async () => {
  await assert.rejects(() => client.callAutoWithRateLimitFallback({
    hasGemini: true, hasGroq: false, isVercel: true,
    gemini: async () => { throw new errors.AIRateLimitError(); },
    groq: async () => "unexpected",
    ollama: async () => "ollama",
  }), (error) => error instanceof errors.AIRateLimitError);
});
