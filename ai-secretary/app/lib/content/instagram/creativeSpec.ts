import { platformBrandPolicy } from "../brandProfile";
import { defaultMonetizationPolicy } from "../monetization/types";

export const INSTAGRAM_PILLARS = [
  "fashion",
  "sneakers",
  "fragrance",
  "lifestyle",
  "coffee",
  "interior",
  "gadget",
  "work-style",
] as const;

export type InstagramPillar = (typeof INSTAGRAM_PILLARS)[number];
export type InstagramFormat = "single" | "carousel" | "reel";
export type InstagramCreativeStatus = "idea" | "draft" | "review" | "approved" | "blocked" | "discarded";
export type InstagramPurpose = "reach" | "save" | "engagement" | "traffic" | "affiliate" | "brand";
export type VerificationState = "verified" | "unverified" | "unknown" | "unavailable";
export type CommercialRelation = "none" | "affiliate" | "pr" | "gifted" | "paid-partnership" | "own-product";

export type InstagramProductClaim = {
  id: string;
  kind: "price" | "effect" | "scent" | "material" | "feature" | "review" | "experience" | "other";
  text: string;
  verification: VerificationState;
  sourceRefs: string[];
};

export type InstagramProductRef = {
  id: string;
  productId: string;
  brand: string;
  name: string;
  category: string;
  sourceUrl?: string;
  productImageAssetIds: string[];
  commercialRelation: CommercialRelation;
  verification: VerificationState;
  claims: InstagramProductClaim[];
};

export type InstagramAssetRef = {
  id: string;
  type:
    | "product-photo"
    | "lifestyle-photo"
    | "personal-photo"
    | "illustration"
    | "background"
    | "cat"
    | "coffee"
    | "gadget"
    | "other";
  source: "user" | "official" | "affiliate" | "authorized" | "generated";
  usageRights: "owned" | "authorized" | "affiliate-provided" | "generated" | "unknown";
  url?: string;
  storageRef?: string;
  realProductRepresentation: boolean;
};

export type InstagramSlideRole =
  | "cover"
  | "hook"
  | "context"
  | "product"
  | "comparison"
  | "reason"
  | "how-to-choose"
  | "recommendation"
  | "summary"
  | "cta"
  | "disclosure";

export type InstagramSlideSpec = {
  id: string;
  order: number;
  role: InstagramSlideRole;
  headline: string;
  subheadline?: string;
  body?: string;
  productRefs: string[];
  assetRefs: string[];
  layoutIntent: string;
  visualEmphasis: string[];
  cta?: string;
};

export type InstagramVisualSpec = {
  palette: Array<"white" | "ivory" | "gray" | "black" | "wood">;
  styles: Array<"clean" | "editorial" | "whitespace" | "thin-line-illustration" | "lifestyle" | "minimal" | "mens-select-media">;
  motifs: Array<"cat" | "coffee" | "lifestyle-object" | "desk" | "interior" | "fragrance" | "fashion-object">;
  notes?: string;
};

export type InstagramCaptionSpec = {
  opening: string;
  body: string;
  cta?: string;
  hashtags: string[];
  disclosure?: string;
};

export type InstagramCommercialSpec = {
  relation: CommercialRelation;
  offerRef?: string;
  affiliateLinkRef?: string;
  disclosureRequired: boolean;
  disclosurePolicyRef?: "default-monetization-policy";
};

export type InstagramCreativeSafety = {
  personalExperience: "none" | "verified" | "unverified";
  sensitiveContent: "none" | "present" | "unknown";
  primaryTopic: "brand" | "product" | "lifestyle" | "investment" | "other";
};

export type InstagramReviewState =
  | { state: "pending" }
  | { state: "approved"; authority: "human"; reviewedBy: string; reviewedAt: string }
  | { state: "rejected"; authority: "human"; reviewedBy: string; reviewedAt: string; reason?: string };

export type InstagramCreativeSpec = {
  id: string;
  version: number;
  platform: "instagram";
  status: InstagramCreativeStatus;
  format: InstagramFormat;
  pillar: InstagramPillar | string;
  purpose: InstagramPurpose;
  audience: string[];
  topic: string;
  angle: string;
  hook: string;
  products: InstagramProductRef[];
  slides: InstagramSlideSpec[];
  assets: InstagramAssetRef[];
  visual: InstagramVisualSpec;
  caption: InstagramCaptionSpec;
  commercial: InstagramCommercialSpec;
  safety: InstagramCreativeSafety;
  /** Canonical research/source IDs only. Research content is not copied into this artifact. */
  sourceRefs: string[];
  review: InstagramReviewState;
  createdAt: string;
  updatedAt: string;
};

export type InstagramValidationIssue = {
  severity: "error" | "warning";
  code:
    | "GENERATED_PRODUCT_REPRESENTATION"
    | "UNKNOWN_USAGE_RIGHTS"
    | "COMMERCIAL_DISCLOSURE_REQUIRED"
    | "PRODUCT_SOURCE_MISSING"
    | "EMPTY_CAROUSEL"
    | "DUPLICATE_SLIDE_ORDER"
    | "BROKEN_PRODUCT_REF"
    | "BROKEN_ASSET_REF"
    | "UNSUPPORTED_PILLAR"
    | "INVESTMENT_PRIMARY_CONTENT"
    | "UNVERIFIED_PERSONAL_EXPERIENCE"
    | "FACTUAL_PRODUCT_CLAIM_SOURCE_MISSING"
    | "REAL_PRODUCT_ASSET_REQUIRED"
    | "INVALID_HUMAN_APPROVAL"
    | "DISCLOSURE_NOT_REQUIRED"
    | "COMMERCIAL_RELATION_MISMATCH"
    | "EMBEDDED_BINARY_ASSET"
    | "CAROUSEL_COVER_REQUIRED"
    | "COVER_HOOK_REQUIRED";
  path: string;
  message: string;
};

export type InstagramCreativeValidation = {
  valid: boolean;
  disposition: "pass" | "review" | "blocked";
  errors: InstagramValidationIssue[];
  warnings: InstagramValidationIssue[];
};

const PILLAR_LABEL: Record<InstagramPillar, string> = {
  fashion: "Fashion",
  sneakers: "Sneakers",
  fragrance: "Fragrance",
  lifestyle: "Lifestyle",
  coffee: "Coffee",
  interior: "Interior",
  gadget: "Gadget",
  "work-style": "Work Style",
};

export function commercialRelationRequiresDisclosure(relation: CommercialRelation): boolean {
  return relation === "affiliate" || relation === "pr" || relation === "gifted" || relation === "paid-partnership";
}

/** Reuses the existing Monetization Policy wording; CreativeSpec does not own a second disclosure policy. */
export function defaultInstagramDisclosure(): string {
  return defaultMonetizationPolicy().affiliateDisclosure;
}

export function createInstagramCreativeDraft(
  input: Omit<InstagramCreativeSpec, "platform" | "status" | "review" | "createdAt" | "updatedAt">,
  now = new Date().toISOString(),
): InstagramCreativeSpec {
  return { ...input, platform: "instagram", status: "draft", review: { state: "pending" }, createdAt: now, updatedAt: now };
}

export function validateInstagramCreativeSpec(spec: InstagramCreativeSpec): InstagramCreativeValidation {
  const errors: InstagramValidationIssue[] = [];
  const warnings: InstagramValidationIssue[] = [];
  const error = (code: InstagramValidationIssue["code"], path: string, message: string) => errors.push({ severity: "error", code, path, message });
  const warning = (code: InstagramValidationIssue["code"], path: string, message: string) => warnings.push({ severity: "warning", code, path, message });

  const supportedPillars = new Set(platformBrandPolicy("instagram").pillars);
  if (!(spec.pillar in PILLAR_LABEL) || !supportedPillars.has(PILLAR_LABEL[spec.pillar as InstagramPillar])) {
    error("UNSUPPORTED_PILLAR", "pillar", "Pillar is not part of the canonical Instagram Brand Policy.");
  }
  if (spec.safety.primaryTopic === "investment") error("INVESTMENT_PRIMARY_CONTENT", "safety.primaryTopic", "Investment cannot be the primary Instagram pillar.");
  if (spec.safety.personalExperience === "unverified") error("UNVERIFIED_PERSONAL_EXPERIENCE", "safety.personalExperience", "Personal experience must be verified by the user.");
  if (spec.format === "carousel" && spec.slides.length === 0) error("EMPTY_CAROUSEL", "slides", "Carousel requires at least one slide.");
  if (spec.format === "carousel" && spec.slides.length > 0) {
    const firstSlide = [...spec.slides].sort((left, right) => left.order - right.order)[0];
    if (firstSlide.role !== "cover") error("CAROUSEL_COVER_REQUIRED", "slides", "The first carousel slide must be a cover.");
    const productNames = new Set(spec.products.map((product) => product.name.trim().toLocaleLowerCase()));
    if (!firstSlide.headline.trim() || productNames.has(firstSlide.headline.trim().toLocaleLowerCase())) {
      error("COVER_HOOK_REQUIRED", `slides.${spec.slides.indexOf(firstSlide)}.headline`, "Cover headline must explain why to view the post, not only repeat a product name.");
    }
  }

  const orders = new Set<number>();
  const productIds = new Set(spec.products.map((item) => item.id));
  const assetIds = new Set(spec.assets.map((item) => item.id));
  for (const [index, slide] of spec.slides.entries()) {
    if (orders.has(slide.order)) error("DUPLICATE_SLIDE_ORDER", `slides.${index}.order`, "Slide order must be unique.");
    orders.add(slide.order);
    for (const ref of slide.productRefs) if (!productIds.has(ref)) error("BROKEN_PRODUCT_REF", `slides.${index}.productRefs`, `Unknown product ref: ${ref}`);
    for (const ref of slide.assetRefs) if (!assetIds.has(ref)) error("BROKEN_ASSET_REF", `slides.${index}.assetRefs`, `Unknown asset ref: ${ref}`);
  }

  for (const [index, asset] of spec.assets.entries()) {
    if (asset.source === "generated" && asset.realProductRepresentation) {
      error("GENERATED_PRODUCT_REPRESENTATION", `assets.${index}`, "Generated assets cannot represent an actual product.");
    }
    if (asset.url?.startsWith("data:") || asset.storageRef?.startsWith("data:")) {
      error("EMBEDDED_BINARY_ASSET", `assets.${index}`, "CreativeSpec accepts references only; embedded binary or Base64 assets are prohibited.");
    }
    if (asset.usageRights === "unknown") warning("UNKNOWN_USAGE_RIGHTS", `assets.${index}.usageRights`, "Usage rights require human review.");
  }

  for (const [index, product] of spec.products.entries()) {
    if (!product.sourceUrl) error("PRODUCT_SOURCE_MISSING", `products.${index}.sourceUrl`, "Product requires a traceable source URL.");
    const productAssets = product.productImageAssetIds.map((id) => spec.assets.find((asset) => asset.id === id));
    for (const id of product.productImageAssetIds) if (!assetIds.has(id)) error("BROKEN_ASSET_REF", `products.${index}.productImageAssetIds`, `Unknown asset ref: ${id}`);
    if (productAssets.length === 0 || productAssets.some((asset) => !asset || asset.source === "generated" || !asset.realProductRepresentation)) {
      error("REAL_PRODUCT_ASSET_REQUIRED", `products.${index}.productImageAssetIds`, "A real product must use a non-generated real-product asset.");
    }
    for (const [claimIndex, claim] of product.claims.entries()) {
      if (claim.verification !== "verified" || claim.sourceRefs.length === 0) {
        error("FACTUAL_PRODUCT_CLAIM_SOURCE_MISSING", `products.${index}.claims.${claimIndex}`, "Product claims require verified, traceable evidence.");
      }
    }
  }

  const relationRequiresDisclosure = commercialRelationRequiresDisclosure(spec.commercial.relation);
  const productRelations = new Set<CommercialRelation>(spec.products.map((product) => product.commercialRelation).filter((relation) => relation !== "none"));
  if (productRelations.size > 0 && !productRelations.has(spec.commercial.relation)) {
    error("COMMERCIAL_RELATION_MISMATCH", "commercial.relation", "Creative commercial relation must represent the referenced products' commercial relation.");
  }
  const hasDisclosure = Boolean(spec.caption.disclosure?.trim());
  if (relationRequiresDisclosure && (!spec.commercial.disclosureRequired || !hasDisclosure)) {
    error("COMMERCIAL_DISCLOSURE_REQUIRED", "commercial", "Commercial relation requires an explicit disclosure.");
  }
  if (!relationRequiresDisclosure && spec.commercial.disclosureRequired) {
    warning("DISCLOSURE_NOT_REQUIRED", "commercial.disclosureRequired", "The selected relation does not require commercial disclosure by policy.");
  }

  if (spec.status === "approved" && (spec.review.state !== "approved" || spec.review.authority !== "human" || !spec.review.reviewedBy || !spec.review.reviewedAt)) {
    error("INVALID_HUMAN_APPROVAL", "review", "Approved status requires recorded human review evidence.");
  }
  if (spec.status !== "approved" && spec.review.state === "approved") {
    error("INVALID_HUMAN_APPROVAL", "review", "Human approval evidence and approved status must transition together.");
  }

  return {
    valid: errors.length === 0,
    disposition: errors.length > 0 ? "blocked" : warnings.length > 0 ? "review" : "pass",
    errors,
    warnings,
  };
}
