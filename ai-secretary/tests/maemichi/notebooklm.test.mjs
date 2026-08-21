import assert from "node:assert/strict";
import test from "node:test";

const notebooklm = await import(`${process.env.MAEMICHI_DIST}/note/research/notebooklm.js`);

test("NotebookLM用プロンプトは出典URL付きJSONを要求する", () => {
  const prompt = notebooklm.notebookLMPrompt("半導体");
  assert.match(prompt, /半導体/);
  assert.match(prompt, /出典URL/);
  assert.match(prompt, /keyFinding/);
});

test("NotebookLMの引用元付き結果をResearchItemへ変換する", () => {
  const parsed = notebooklm.parseNotebookLMImport(JSON.stringify({
    topic: "半導体",
    summary: "要約",
    sources: [{ title: "公式発表", url: "https://example.com/report", excerpt: "発表本文の要約", keyFinding: "需要が増えた" }],
  }));
  const items = notebooklm.notebookLMResearchItems(parsed, "2026-08-17T00:00:00.000Z");
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "notebooklm");
  assert.equal(items[0].sourceUrl, "https://example.com/report");
  assert.match(items[0].textExcerpt, /需要が増えた/);
});

test("出典URLがない結果や内部URLは拒否する", () => {
  assert.throws(() => notebooklm.parseNotebookLMImport(JSON.stringify({ topic: "AI", sources: [] })), /有効な出典/);
  assert.throws(() => notebooklm.parseNotebookLMImport(JSON.stringify({
    topic: "AI",
    sources: [{ title: "内部", url: "http://localhost/private", excerpt: "x", keyFinding: "y" }],
  })), /有効な出典/);
});
