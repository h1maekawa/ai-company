import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("IG-0 extends shared Content Core rather than creating an Instagram persistence store", () => {
  const store = read("app/lib/content/core/store.ts");
  assert.match(store, /products: PersonalProduct\[\]/);
  assert.match(store, /mediaAssets: MediaAsset\[\]/);
  assert.equal(fs.existsSync(path.join(root, "app/lib/content/instagram/store.ts")), false);
});

test("Instagram is a PublishChannel but publishing stays fail-closed until configured", () => {
  assert.match(read("app/lib/content/monetization/types.ts"), /"note" \| "x" \| "instagram"/);
  const route = read("app/api/content/published/route.ts");
  assert.match(route, /INSTAGRAM_PUBLISH_NOT_CONFIGURED/);
  assert.match(route, /status: 503/);
  assert.match(route, /body\.channel === "x" \? "x" : "note"/);
});

test("Instagram Operating Page reports explicit unavailable states and canonical inventory", () => {
  const page = read("app/content/instagram/page.tsx");
  assert.match(page, /TODAY/);
  assert.match(page, /My Product Vault/);
  assert.match(page, /Asset Library/);
  assert.match(page, /NOT_CONFIGURED/);
  assert.match(page, /NOT_IMPLEMENTED/);
  assert.doesNotMatch(page, /Production publishing is active/i);
  assert.match(page, /force-dynamic/);
});

test("Product and Asset mutations require same-origin and explicit human experience confirmation", () => {
  const products = read("app/api/content/products/route.ts");
  const assets = read("app/api/content/media-assets/route.ts");
  assert.match(products, /isSameOriginMutation/);
  assert.match(products, /HUMAN_CONFIRMATION_REQUIRED/);
  assert.match(products, /confirmedByHuman !== true/);
  assert.match(assets, /isSameOriginMutation/);
});
