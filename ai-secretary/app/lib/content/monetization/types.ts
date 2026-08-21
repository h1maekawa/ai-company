/**
 * Monetization Core — 「何を書くか」だけでなく「何のために投稿するか」を持たせるための型。
 *
 * 原則:
 *  - Revenueは manual / 正式API / import のみがFact。AIは生成しない
 *  - Draftは公開ではない。PublishedContentのみが本人の正式な発信
 *  - 取得できない数値は0ではなくundefined/null
 *  - 同じRevenueEventを複数Contentへ二重計上しない（1 RevenueEvent = 1 publishedContentId）
 */

import type { ContentGoal, FunnelStage } from "../../note/research/types";

export type { ContentGoal, FunnelStage };

/* ─── Offer ───────────────────────────────────────── */

export type OfferType =
  | "paid-note"
  | "affiliate"
  | "membership"
  | "timebox"
  | "digital-product"
  | "service"
  | "external-product"
  | "other";

export type OfferStatus = "draft" | "active" | "paused" | "archived";

export type Offer = {
  id: string;
  name: string;
  type: OfferType;
  description: string;

  destinationUrl?: string;

  price?: number;
  currency?: string;

  status: OfferStatus;

  affiliateNetwork?: string;
  affiliateProgram?: string;
  affiliateDisclosureRequired?: boolean;

  /** 既存 affiliate-links.md の AffiliateLink id（重複データを持たず参照する） */
  affiliateLinkId?: string;

  productId?: string;

  createdAt: string;
  updatedAt: string;
};

/* ─── CTA ─────────────────────────────────────────── */

export type CTAType =
  | "article-end"
  | "article-middle"
  | "x-post"
  | "x-reply"
  | "profile"
  | "product"
  | "membership"
  | "paid-note"
  | "affiliate";

export type CTA = {
  id: string;
  name: string;
  type: CTAType;
  text: string;

  offerId?: string;
  destinationUrl?: string;
  placement?: string;

  createdAt: string;
  updatedAt: string;
};

/* ─── Campaign ────────────────────────────────────── */

export type CampaignStatus = "draft" | "active" | "completed" | "archived";

export type Campaign = {
  id: string;
  name: string;
  goal: string;

  offerIds: string[];

  startAt?: string;
  endAt?: string;

  contentIds: string[];

  status: CampaignStatus;

  createdAt: string;
  updatedAt: string;
};

/* ─── Monetization Policy ────────────────────────────── */

export type MonetizationPolicy = {
  /** 現在利用する収益源のOfferType。有効化されていない種類はAIが提案しない */
  allowedOfferTypes: OfferType[];
  prohibitedCategories: string[];
  preferredCTAStyle?: string;
  affiliateDisclosure: string;
  pricingNotes?: string;
  updatedAt: string;
};

export function defaultMonetizationPolicy(): MonetizationPolicy {
  return {
    allowedOfferTypes: [],
    prohibitedCategories: [],
    affiliateDisclosure: "※本記事にはプロモーションが含まれます",
    updatedAt: new Date().toISOString(),
  };
}

/* ─── Published Record ───────────────────────────────── */

export type PublishChannel = "note" | "x";
export type PublishedStatus = "published" | "unpublished" | "removed";

/**
 * 正式な公開物の正。AI Draftは含まない。
 * 本人操作、または正式なPublish連携成功時のみ作成する。
 */
export type PublishedContent = {
  id: string;
  channel: PublishChannel;

  contentId: string;
  draftId?: string;
  articleSessionId?: string;

  title: string;
  bodySummary?: string;

  url?: string;
  publishedAt: string;

  contentGoal?: ContentGoal;
  funnelStage?: FunnelStage;

  offerIds: string[];
  ctaIds: string[];

  campaignId?: string;

  status: PublishedStatus;
};

/* ─── Performance Snapshot ───────────────────────────── */

export type PerformanceSource = "manual" | "api" | "import";

/**
 * 手入力を含む、投稿後の反応の時系列スナップショット。
 * 取得できない値は null（未取得）。0と推測しない。
 */
export type PerformanceSnapshot = {
  id: string;
  publishedContentId: string;
  capturedAt: string;

  impressions?: number | null;
  views?: number | null;

  likes?: number | null;
  comments?: number | null;
  replies?: number | null;
  reposts?: number | null;
  bookmarks?: number | null;

  profileVisits?: number | null;
  follows?: number | null;

  linkClicks?: number | null;
  ctaClicks?: number | null;

  paidPurchases?: number | null;
  affiliateClicks?: number | null;
  conversions?: number | null;

  revenue?: number | null;
  currency?: string;

  source: PerformanceSource;
  notes?: string;
};

/* ─── Conversion ──────────────────────────────────────── */

export type ConversionEventType =
  | "click"
  | "lead"
  | "signup"
  | "purchase"
  | "affiliate-conversion"
  | "membership-join"
  | "product-signup";

export type Conversion = {
  id: string;
  publishedContentId: string;

  offerId?: string;
  ctaId?: string;

  eventType: ConversionEventType;

  value?: number;

  occurredAt: string;
  source: PerformanceSource;
};

/* ─── Revenue Event ───────────────────────────────────── */

export type RevenueType =
  | "paid-note"
  | "affiliate"
  | "membership"
  | "product"
  | "service"
  | "timebox"
  | "other";

/**
 * Revenueの唯一の正データ。AIは生成禁止。1件のRevenueEventは必ず1つのpublishedContentIdへのみ属する
 * （複数Contentへの二重計上を防ぐため、配分が必要な場合は amount を按分して複数件に分けて記録する）。
 */
export type RevenueEvent = {
  id: string;
  publishedContentId: string;
  offerId?: string;
  ctaId?: string;

  type: RevenueType;

  amount: number;
  currency: string;
  quantity?: number;

  occurredAt: string;

  source: PerformanceSource;
  externalReference?: string;
  notes?: string;
};

export type AttributionType = "direct" | "assisted" | "unknown";

export type Attribution = {
  publishedContentId: string;
  ctaId?: string;
  offerId?: string;
  revenueEventId: string;
  attributionType: AttributionType;
};
