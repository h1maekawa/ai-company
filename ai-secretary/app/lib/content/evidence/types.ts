import type { AttributionType } from "../monetization/types";

export type ContentRelationType =
  | "drives_to"
  | "derived_from"
  | "promotes"
  | "tests_demand_for";

export type RelationEvidenceType = "explicit_link" | "campaign" | "manual" | "system";

/** DraftではなくPublishedContent同士の関係だけを保持する。 */
export type ContentRelation = {
  id: string;
  sourcePublishedContentId: string;
  targetPublishedContentId: string;
  relationType: ContentRelationType;
  evidenceType: RelationEvidenceType;
  createdAt: string;
};

/**
 * Company Revenueの金額を複製しないCross-content貢献証跡。
 * attributedAmountYenは人間が明示確認した場合だけ任意で保持する。
 */
export type ContentContribution = {
  id: string;
  companyRevenueId: string;
  sourcePublishedContentId: string;
  targetPublishedContentId: string;
  contributionType: Extract<AttributionType, "assisted">;
  evidenceType: Exclude<RelationEvidenceType, "system">;
  attributedAmountYen?: number;
  confirmedByHuman: boolean;
  createdAt: string;
};

export type DemandEvidenceStatus = "OBSERVED" | "INSUFFICIENT_DATA" | "UNKNOWN";

/** PerformanceSnapshotからのみ作る観測事実。AI推測値を含まない。 */
export type CreatorDemandEvidence = {
  sourcePublishedContentId: string;
  sourcePerformanceId: string;
  sourceKnowledgeId?: string;
  opportunityId?: string;
  impressions?: number;
  engagements?: number;
  engagementCoveragePct: number;
  engagementRate?: number;
  profileVisits?: number;
  follows?: number;
  linkClicks?: number;
  clickThroughRate?: number;
  capturedAt: string;
  coveragePct: number;
  status: DemandEvidenceStatus;
  /** 本人の過去X投稿との相対値。比較不足時は存在しない。 */
  relativeScore?: number;
  baselineSampleSize: number;
};

export type EvidenceFile = {
  relations: ContentRelation[];
  contributions: ContentContribution[];
};
