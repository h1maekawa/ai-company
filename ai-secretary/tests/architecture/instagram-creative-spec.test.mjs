import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("B2 CreativeSpec remains contract-only and protects product imagery", () => {
  const contract = read("app/lib/content/instagram/creativeSpec.ts");
  const docs = read("docs/INSTAGRAM_CREATIVE_SPEC.md");
  assert.match(contract, /GENERATED_PRODUCT_REPRESENTATION/);
  assert.match(contract, /REAL_PRODUCT_ASSET_REQUIRED/);
  assert.match(contract, /platformBrandPolicy\("instagram"\)/);
  assert.match(contract, /authority: "human"/);
  assert.match(docs, /REPRESENTATIONAL_GAP/);
  assert.match(docs, /not publish authorization/i);
  assert.doesNotMatch(contract, /createPost|publishPost|Buffer|Meta API|Redis|database/);
});

test("B2 does not add an Instagram runtime provider or persistence path", () => {
  const files = fs.readdirSync(path.join(root, "app/lib/content/instagram"));
  assert.deepEqual(files.sort(), ["creativeSpec.ts", "fixtures.ts", "templates.ts"]);
  const master = read("docs/AI_COMPANY_MASTER.md");
  assert.match(master, /\[x\] B2: define Instagram `CreativeSpec`/);
  assert.match(master, /Next PRs[\s\S]*1\. \*\*B3 Carousel\*\*/);
});
