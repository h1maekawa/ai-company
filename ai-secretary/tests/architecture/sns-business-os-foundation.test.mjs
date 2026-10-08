import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

test("version-controlled Brand Profile separates X, Instagram, and Note policies", () => {
  const profile = read("app/lib/content/brandProfile.ts");
  assert.match(profile, /export type ContentPlatform = "x" \| "instagram" \| "note"/);
  for (const platform of ["x", "instagram", "note"]) assert.match(profile, new RegExp(`${platform}: \\{`));
  assert.match(profile, /Piro \/ まえみち/);
  assert.match(profile, /自分なりにちゃんと選ぶことで、毎日を少し良くする/);
});

test("X policy requires viewpoint structure and rejects simple news summaries", () => {
  const profile = read("app/lib/content/brandProfile.ts");
  for (const principle of ["Fact", "Why it matters", "Maemichi View", "ニュース単純要約"]) {
    assert.match(profile, new RegExp(principle));
  }
});

test("Instagram foundation contains real-product and core pillar policy without fake metrics", () => {
  const profile = read("app/lib/content/brandProfile.ts");
  const page = read("app/content/instagram/page.tsx");
  for (const pillar of ["Fashion", "Sneakers", "Fragrance", "Lifestyle"]) assert.match(profile, new RegExp(pillar));
  assert.match(profile, /実商品は実物画像を優先/);
  assert.match(page, /NOT_CONFIGURED/);
  assert.match(page, /利用できない数値を0や推測値として表示しません/);
  assert.doesNotMatch(page, /impressions|engagement|followers|reach/i);
});

test("SNS Primary navigation is Overview, X, Instagram, and Note", () => {
  const layout = read("app/content/layout.tsx");
  for (const [href, label] of [["/content", "概要"], ["/content/x", "X"], ["/content/instagram", "Instagram"], ["/content/note", "Note"]]) {
    assert.match(layout, new RegExp(`href: "${href.replaceAll("/", "\\/")}", label: "${label}"`));
  }
  assert.match(layout, /詳細・Advanced/);
});

test("legacy Content deep links remain available", () => {
  for (const route of ["performance", "revenue", "learnings", "published", "materials", "research", "offers", "settings"]) {
    assert.ok(exists(`app/content/${route}/page.tsx`), `/content/${route} must remain available`);
  }
});

test("X and Note generation receive Brand Policy without replacing safety layers", () => {
  const generate = read("app/lib/note/research/generate.ts");
  const compose = read("app/lib/note/compose.ts");
  const profile = read("app/lib/content/brandProfile.ts");
  assert.match(generate, /buildContentBrandContext\(channel\)/);
  assert.match(compose, /buildContentBrandContext\("note"\)/);
  assert.match(compose, /platformBrandPolicy\("x"\)/);
  for (const boundary of ["Fact Gate", "Safety Gate", "Duplicate Guard", "Publish Eligibility"]) {
    assert.match(profile, new RegExp(boundary));
  }
});

test("Overview exposes three platform businesses and no Instagram invented result", () => {
  const overview = read("app/content/page.tsx");
  for (const href of ["/content/x", "/content/instagram", "/content/note"]) assert.ok(overview.includes(`href="${href}"`));
  assert.match(overview, /NOT_CONFIGURED/);
  assert.match(overview, /data\?\.growth\.impressions7d/);
  assert.doesNotMatch(overview, /Instagram[\s\S]{0,300}(?:impressions|followers|engagement)/i);
});
