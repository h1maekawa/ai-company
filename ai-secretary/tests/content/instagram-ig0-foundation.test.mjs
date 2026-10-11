import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-instagram-ig0-"));
const DIST = process.env.CONTENT_DIST;
const types = await import(path.join(DIST, "content/core/types.js"));
const store = await import(path.join(DIST, "content/core/store.js"));

const now = "2026-10-11T00:00:00.000Z";
const product = (overrides = {}) => ({
  id: "product-ylang-49",
  brand: "Le Labo",
  name: "YLANG 49",
  category: "fragrance",
  ownership: "owned",
  personalExperience: {
    summary: "森を思わせる香り",
    positives: ["落ち着く"],
    negatives: [],
    suitableFor: ["ウッディな香りが好きな人"],
    unsuitableFor: [],
    confirmedByUser: false,
  },
  assetIds: [],
  officialSourceRefs: ["research:item:ylang-49"],
  offerIds: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

test("Product Vault CRUD round-trips in the existing Content Core SSOT", async () => {
  await store.upsertProduct(product());
  let core = await store.loadContentCore();
  assert.equal(core.products.length, 1);
  assert.equal(core.products[0].name, "YLANG 49");
  await store.upsertProduct({ ...core.products[0], purchaseSource: "official-store" });
  core = await store.loadContentCore();
  assert.equal(core.products[0].purchaseSource, "official-store");
  assert.equal(await store.deleteProduct(core.products[0].id), true);
  assert.equal((await store.loadContentCore()).products.length, 0);
});

test("unverified personal experience is unavailable to Creative consumers", () => {
  assert.equal(types.personalExperienceForCreative(product()), undefined);
  const verified = product({ personalExperience: { ...product().personalExperience, confirmedByUser: true, confirmedAt: now } });
  assert.equal(types.personalExperienceForCreative(verified)?.summary, "森を思わせる香り");
  const invalid = product({ personalExperience: { ...product().personalExperience, confirmedByUser: true } });
  assert.ok(types.validatePersonalProduct(invalid).errors.includes("PERSONAL_EXPERIENCE_CONFIRMATION_TIME_REQUIRED"));
});

test("Asset Library preserves refs and rights while rejecting generated product representation", async () => {
  await store.upsertProduct(product({ personalExperience: undefined }));
  const safe = {
    id: "asset-product-photo",
    type: "product-photo",
    source: "user",
    productIds: ["product-ylang-49"],
    usageRights: "owned",
    storageRef: "storage://instagram/ylang-49.jpg",
    realProductRepresentation: true,
    createdAt: now,
    updatedAt: now,
  };
  await store.upsertMediaAsset(safe);
  const core = await store.loadContentCore();
  assert.equal(core.mediaAssets[0].storageRef, safe.storageRef);
  assert.deepEqual(core.products[0].assetIds, [safe.id]);
  await store.upsertMediaAsset({ ...safe, productIds: [] });
  assert.deepEqual((await store.loadContentCore()).products[0].assetIds, [], "unlink removes the stale Product reference");
  await store.upsertMediaAsset(safe);
  assert.ok(types.validateMediaAsset({ ...safe, source: "generated", usageRights: "generated" }).errors.includes("GENERATED_PRODUCT_REPRESENTATION"));
  assert.ok(types.validateMediaAsset({ ...safe, storageRef: "data:image/png;base64,AA==" }).errors.includes("EMBEDDED_BINARY_ASSET"));
  assert.ok(types.validateMediaAsset({ ...safe, usageRights: "unknown" }).warnings.includes("ASSET_RIGHTS_UNKNOWN"));
  assert.equal(await store.deleteMediaAsset(safe.id), true);
  assert.deepEqual((await store.loadContentCore()).products[0].assetIds, []);
});
