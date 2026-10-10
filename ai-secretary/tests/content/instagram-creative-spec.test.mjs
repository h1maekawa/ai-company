import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const root = process.env.CONTENT_DIST;
const creative = await import(path.join(root, "content/instagram/creativeSpec.js"));
const fixtures = await import(path.join(root, "content/instagram/fixtures.js"));
const templates = await import(path.join(root, "content/instagram/templates.js"));

const validSpec = () => fixtures.gucciFloraCreativeSpecFixture();
const validate = (spec) => creative.validateInstagramCreativeSpec(spec);

test("valid CreativeSpec example passes and preserves unknown rather than inventing facts", () => {
  const spec = validSpec();
  assert.equal(spec.products[0].verification, "unknown");
  assert.equal(spec.products[0].claims.length, 0);
  assert.equal(validate(spec).disposition, "pass");
});

test("generated product image fails while generated decoration passes", () => {
  const safe = validSpec();
  assert.equal(validate(safe).valid, true);
  const unsafe = structuredClone(safe);
  unsafe.assets[0].source = "generated";
  unsafe.assets[0].usageRights = "generated";
  assert.ok(validate(unsafe).errors.some((issue) => issue.code === "GENERATED_PRODUCT_REPRESENTATION"));
});

test("unknown usage rights warns without converting missing information to false or zero", () => {
  const spec = validSpec();
  spec.assets[0].usageRights = "unknown";
  const result = validate(spec);
  assert.equal(result.valid, true);
  assert.equal(result.disposition, "review");
  assert.ok(result.warnings.some((issue) => issue.code === "UNKNOWN_USAGE_RIGHTS"));
  assert.equal(spec.products[0].claims.length, 0);
});

test("affiliate requires disclosure while non-commercial content does not", () => {
  const affiliate = validSpec();
  affiliate.commercial = { relation: "affiliate", disclosureRequired: false, affiliateLinkRef: "affiliate-link-1" };
  assert.ok(validate(affiliate).errors.some((issue) => issue.code === "COMMERCIAL_DISCLOSURE_REQUIRED"));
  const disclosed = validSpec();
  disclosed.commercial = { relation: "affiliate", disclosureRequired: true, disclosurePolicyRef: "default-monetization-policy", affiliateLinkRef: "affiliate-link-1" };
  disclosed.caption.disclosure = creative.defaultInstagramDisclosure();
  assert.equal(validate(disclosed).valid, true);
  assert.equal(validate(validSpec()).warnings.some((issue) => issue.code === "DISCLOSURE_NOT_REQUIRED"), false);
});

test("carousel structure catches duplicate orders, broken refs, and empty slides", () => {
  const duplicate = validSpec();
  duplicate.slides[1].order = duplicate.slides[0].order;
  assert.ok(validate(duplicate).errors.some((issue) => issue.code === "DUPLICATE_SLIDE_ORDER"));
  const broken = validSpec();
  broken.slides[0].assetRefs.push("missing-asset");
  assert.ok(validate(broken).errors.some((issue) => issue.code === "BROKEN_ASSET_REF"));
  const empty = validSpec();
  empty.slides = [];
  assert.ok(validate(empty).errors.some((issue) => issue.code === "EMPTY_CAROUSEL"));
});

test("carousel cover needs a hook and assets cannot embed binary data", () => {
  const noHook = validSpec();
  noHook.slides[0].headline = noHook.products[0].name;
  assert.ok(validate(noHook).errors.some((issue) => issue.code === "COVER_HOOK_REQUIRED"));
  const embedded = validSpec();
  embedded.assets[1].storageRef = "data:image/png;base64,AA==";
  assert.ok(validate(embedded).errors.some((issue) => issue.code === "EMBEDDED_BINARY_ASSET"));
});

test("AI draft helper cannot self-approve and invalid approved state is blocked", () => {
  const spec = validSpec();
  assert.equal(spec.status, "draft");
  assert.deepEqual(spec.review, { state: "pending" });
  spec.status = "approved";
  assert.ok(validate(spec).errors.some((issue) => issue.code === "INVALID_HUMAN_APPROVAL"));
});

test("Instagram Brand pillar validation and product evidence safety work", () => {
  const unsupported = validSpec();
  unsupported.pillar = "investment";
  unsupported.safety.primaryTopic = "investment";
  const pillarResult = validate(unsupported);
  assert.ok(pillarResult.errors.some((issue) => issue.code === "UNSUPPORTED_PILLAR"));
  assert.ok(pillarResult.errors.some((issue) => issue.code === "INVESTMENT_PRIMARY_CONTENT"));
  const missingSource = validSpec();
  delete missingSource.products[0].sourceUrl;
  assert.ok(validate(missingSource).errors.some((issue) => issue.code === "PRODUCT_SOURCE_MISSING"));
});

test("real products require non-generated product assets and factual claims need sources", () => {
  const noImage = validSpec();
  noImage.products[0].productImageAssetIds = [];
  assert.ok(validate(noImage).errors.some((issue) => issue.code === "REAL_PRODUCT_ASSET_REQUIRED"));
  const claim = validSpec();
  claim.products[0].claims.push({ id: "claim-1", kind: "price", text: "current price", verification: "unknown", sourceRefs: [] });
  assert.ok(validate(claim).errors.some((issue) => issue.code === "FACTUAL_PRODUCT_CLAIM_SOURCE_MISSING"));
});

test("product commercial relation cannot be hidden by a non-commercial creative", () => {
  const spec = validSpec();
  spec.products[0].commercialRelation = "affiliate";
  assert.ok(validate(spec).errors.some((issue) => issue.code === "COMMERCIAL_RELATION_MISMATCH"));
});

test("all initial structural templates are represented", () => {
  assert.deepEqual(templates.INSTAGRAM_CREATIVE_TEMPLATES.map((template) => template.name), [
    "Product Hero", "3 Picks", "5 Picks", "Comparison", "Ranking", "How to Choose", "Personal Pick", "Lifestyle",
  ]);
  assert.ok(templates.INSTAGRAM_CREATIVE_TEMPLATES.every((template) => template.slideRoles.length > 0));
});
