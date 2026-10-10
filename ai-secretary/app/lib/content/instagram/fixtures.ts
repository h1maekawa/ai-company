import { createInstagramCreativeDraft, type InstagramCreativeSpec } from "./creativeSpec";

/** Contract capability fixture only. It intentionally contains no current price or unverified product claim. */
export function gucciFloraCreativeSpecFixture(): InstagramCreativeSpec {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return createInstagramCreativeDraft({
    id: "instagram-fixture-gucci-flora",
    version: 1,
    format: "carousel",
    pillar: "fragrance",
    purpose: "save",
    audience: ["服・香り・靴・暮らしを自分で選びたい20代男性"],
    topic: "Gucci Gorgeous Flora Gardeniaを選ぶための入口",
    angle: "商品情報を断定せず、公式情報を確認する前の選び方を整理する",
    hook: "香りの印象を選ぶ材料に",
    products: [{
      id: "product-gucci-flora",
      productId: "gucci-gorgeous-flora-gardenia",
      brand: "Gucci",
      name: "Gorgeous Flora Gardenia",
      category: "fragrance",
      sourceUrl: "https://www.gucci.com/",
      productImageAssetIds: ["asset-official-product"],
      commercialRelation: "none",
      verification: "unknown",
      claims: [],
    }],
    assets: [{
      id: "asset-official-product",
      type: "product-photo",
      source: "official",
      usageRights: "authorized",
      url: "https://www.gucci.com/",
      realProductRepresentation: true,
    }, {
      id: "asset-generated-decoration",
      type: "illustration",
      source: "generated",
      usageRights: "generated",
      storageRef: "fixture://thin-line-decoration",
      realProductRepresentation: false,
    }],
    slides: [{
      id: "slide-cover", order: 1, role: "cover", headline: "香りの印象を選ぶ材料に", productRefs: ["product-gucci-flora"], assetRefs: ["asset-official-product", "asset-generated-decoration"], layoutIntent: "editorial cover", visualEmphasis: ["product", "whitespace"],
    }, {
      id: "slide-context", order: 2, role: "context", headline: "まず公式情報を確認", body: "商品情報と画像は参照元で確認する", productRefs: ["product-gucci-flora"], assetRefs: ["asset-official-product"], layoutIntent: "single column", visualEmphasis: ["source"],
    }, {
      id: "slide-cta", order: 3, role: "cta", headline: "保存して選ぶときに見返す", productRefs: [], assetRefs: [], layoutIntent: "minimal", visualEmphasis: ["cta"], cta: "保存",
    }],
    visual: { palette: ["white", "ivory", "black"], styles: ["clean", "editorial", "whitespace", "thin-line-illustration"], motifs: ["fragrance"] },
    caption: { opening: "香りを選ぶ前の確認ポイント。", body: "商品情報は公式参照先で確認します。", cta: "保存して見返す", hashtags: ["香水選び"] },
    commercial: { relation: "none", disclosureRequired: false },
    safety: { personalExperience: "none", sensitiveContent: "none", primaryTopic: "product" },
    sourceRefs: ["research-fixture-official-product-page"],
  }, timestamp);
}
