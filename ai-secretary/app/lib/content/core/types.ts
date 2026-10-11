/**
 * Content Core — Note事業部・X事業部が共有する発信材料の型。
 * Timeboxはこの中の「1つのsourceType」であり、hard dependencyにしない。
 */

export type MaterialType = "note" | "text" | "conversation" | "link" | "task" | "other";

export type MaterialSourceType =
  | "manual"
  | "obsidian"
  | "research"
  | "timebox"
  | "upload"
  | "url"
  | "previous-content";

export type MaterialStatus = "inbox" | "reviewed" | "selected" | "archived";

export type ProductOwnership = "owned" | "used" | "tested" | "considering" | "not-owned";

export type PersonalExperience = {
  summary: string;
  positives: string[];
  negatives: string[];
  suitableFor: string[];
  unsuitableFor: string[];
  rating?: number;
  confirmedByUser: boolean;
  confirmedAt?: string;
};

/** Shared Content product entity. Instagram references it; it is not an Instagram-only truth store. */
export type PersonalProduct = {
  id: string;
  brand: string;
  name: string;
  category: string;
  ownership: ProductOwnership;
  purchasedAt?: string;
  purchaseSource?: string;
  personalExperience?: PersonalExperience;
  assetIds: string[];
  officialSourceRefs: string[];
  offerIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MediaAssetType =
  | "product-photo"
  | "product-video"
  | "lifestyle-photo"
  | "lifestyle-video"
  | "generated-background"
  | "illustration"
  | "audio"
  | "music"
  | "voice"
  | "other";
export type MediaAssetSource = "user" | "official" | "affiliate" | "authorized" | "generated";
export type MediaUsageRights = "owned" | "authorized" | "affiliate-provided" | "generated" | "unknown";

/** Binary data stays in storage; Content Core only owns the reference and rights metadata. */
export type MediaAsset = {
  id: string;
  type: MediaAssetType;
  source: MediaAssetSource;
  productIds: string[];
  usageRights: MediaUsageRights;
  storageRef: string;
  /** True only when the asset visually represents a real product. */
  realProductRepresentation: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
  createdAt: string;
  updatedAt: string;
};

export type ContentEntityValidation = { valid: boolean; errors: string[]; warnings: string[] };

const PRODUCT_OWNERSHIP = new Set<ProductOwnership>(["owned", "used", "tested", "considering", "not-owned"]);
const MEDIA_ASSET_TYPES = new Set<MediaAssetType>(["product-photo", "product-video", "lifestyle-photo", "lifestyle-video", "generated-background", "illustration", "audio", "music", "voice", "other"]);
const MEDIA_ASSET_SOURCES = new Set<MediaAssetSource>(["user", "official", "affiliate", "authorized", "generated"]);
const MEDIA_USAGE_RIGHTS = new Set<MediaUsageRights>(["owned", "authorized", "affiliate-provided", "generated", "unknown"]);

export function validatePersonalProduct(product: PersonalProduct): ContentEntityValidation {
  const errors: string[] = [];
  if (!product.id.trim()) errors.push("PRODUCT_ID_REQUIRED");
  if (!product.brand.trim()) errors.push("PRODUCT_BRAND_REQUIRED");
  if (!product.name.trim()) errors.push("PRODUCT_NAME_REQUIRED");
  if (!product.category.trim()) errors.push("PRODUCT_CATEGORY_REQUIRED");
  if (!PRODUCT_OWNERSHIP.has(product.ownership)) errors.push("PRODUCT_OWNERSHIP_INVALID");
  const experience = product.personalExperience;
  if (experience?.confirmedByUser && !experience.confirmedAt) errors.push("PERSONAL_EXPERIENCE_CONFIRMATION_TIME_REQUIRED");
  if (experience?.rating !== undefined && (experience.rating < 0 || experience.rating > 5)) errors.push("PERSONAL_EXPERIENCE_RATING_INVALID");
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function personalExperienceForCreative(product: PersonalProduct): PersonalExperience | undefined {
  return product.personalExperience?.confirmedByUser ? product.personalExperience : undefined;
}

export function validateMediaAsset(asset: MediaAsset): ContentEntityValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!asset.id.trim()) errors.push("ASSET_ID_REQUIRED");
  if (!asset.storageRef.trim()) errors.push("ASSET_STORAGE_REF_REQUIRED");
  if (!MEDIA_ASSET_TYPES.has(asset.type)) errors.push("ASSET_TYPE_INVALID");
  if (!MEDIA_ASSET_SOURCES.has(asset.source)) errors.push("ASSET_SOURCE_INVALID");
  if (!MEDIA_USAGE_RIGHTS.has(asset.usageRights)) errors.push("ASSET_USAGE_RIGHTS_INVALID");
  if (asset.storageRef.startsWith("data:")) errors.push("EMBEDDED_BINARY_ASSET");
  if (asset.source === "generated" && asset.realProductRepresentation) errors.push("GENERATED_PRODUCT_REPRESENTATION");
  if (asset.type === "generated-background" && asset.source !== "generated") errors.push("GENERATED_BACKGROUND_SOURCE_INVALID");
  if (asset.usageRights === "unknown") warnings.push("ASSET_RIGHTS_UNKNOWN");
  return { valid: errors.length === 0, errors, warnings };
}

export type Material = {
  id: string;
  type: MaterialType;
  title: string;
  rawContent: string;
  summary?: string;

  sourceType: MaterialSourceType;
  /** 由来元の識別子（Timeboxのタスクid、Obsidianのvault path、公開済みcontentIdなど） */
  sourceId?: string;
  sourceUrl?: string;

  createdAt: string;
  importedAt?: string;
  updatedAt: string;

  status: MaterialStatus;
};

export function createMaterial(input: {
  type: MaterialType;
  title: string;
  rawContent: string;
  summary?: string;
  sourceType: MaterialSourceType;
  sourceId?: string;
  sourceUrl?: string;
}): Material {
  const now = new Date().toISOString();
  return {
    id: `mat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    title: input.title,
    rawContent: input.rawContent,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    createdAt: now,
    importedAt: input.sourceType === "manual" ? undefined : now,
    updatedAt: now,
    status: "inbox",
  };
}

/* ─── Content Candidate ──────────────────────────────── */

export type ContentCandidateStatus = "suggested" | "approved" | "rejected" | "converted";

export type ContentCandidate = {
  id: string;
  title: string;
  summary: string;

  sourceType: MaterialSourceType;
  sourceIds: string[];

  whyInteresting: string;
  suggestedAngle?: string;
  suggestedCategory?: string;

  /** 裏付け（Material/Research由来の事実のみ。AIが創作した数字・体験を含めない） */
  evidence: string[];

  status: ContentCandidateStatus;
  createdAt: string;
};

export function createContentCandidate(input: {
  title: string;
  summary: string;
  sourceType: MaterialSourceType;
  sourceIds: string[];
  whyInteresting: string;
  suggestedAngle?: string;
  suggestedCategory?: string;
  evidence?: string[];
}): ContentCandidate {
  return {
    id: `cand_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceIds: input.sourceIds,
    whyInteresting: input.whyInteresting,
    suggestedAngle: input.suggestedAngle,
    suggestedCategory: input.suggestedCategory,
    evidence: input.evidence ?? [],
    // AIが作る時点では必ず suggested。approved/converted は本人操作のみが遷移させる
    status: "suggested",
    createdAt: new Date().toISOString(),
  };
}
