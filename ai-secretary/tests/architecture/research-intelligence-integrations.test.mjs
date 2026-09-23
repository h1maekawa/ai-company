import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("/investing/research is the main Investment Research view: Ask, Recent, Theme, Company (no In Progress)", () => {
  const page = read("app/investing/research/page.tsx");
  const order = ['title="Ask Research"', 'title="Recent Research"', 'title="Theme Research"', 'title="Company Research"'].map((token) => page.indexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(page, /In Progress/);
  assert.match(page, /fetch\("\/api\/company\/research", \{ method: "POST"/);
  assert.match(page, /routeTo/);
});

test("Artifact view exposes Source / Published / Fetched / Reliability per fact and never labels stale research as latest", () => {
  const view = read("components/investing/ResearchArtifactView.tsx");
  for (const token of ["fact.source.reliability", "Published", "Fetched", "fact.source.url"]) assert.ok(view.includes(token), token);
  assert.match(view, /"FRESH" : "STALE"/);
  assert.match(view, /最新ではありません/);
  assert.match(view, /Evidenceなし/);
  assert.match(view, /推奨銘柄ではありません/);
  assert.doesNotMatch(view, />[^<]*(買う|売る|注文する|BUY|SELL)[^<]*<\/(button|Link)>/);
});

test("Creator drafts can optionally reference R&I artifacts with lineage, without touching safety gates", () => {
  const daily = read("app/lib/note/automation/dailyX.ts");
  const generate = read("app/lib/note/research/generate.ts");
  const types = read("app/lib/note/research/types.ts");
  assert.match(daily, /buildCreatorResearchContext\([\s\S]*\.catch\(\(\) => null\)/);
  assert.match(daily, /prepareXDraftForPublishing/);
  assert.match(generate, /sourceArtifactIds: input\.researchContext\.artifactIds/);
  assert.match(types, /sourceArtifactIds\?: string\[\]/);
  assert.equal((types.match(/sourceArtifactIds/g) ?? []).length, 1, "lineage field is not duplicated");
});
