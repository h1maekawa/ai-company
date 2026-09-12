/**
 * 収益機会 — Phase 5 §16 / §17 / §18 / §56
 *
 * §18 の要点: 根拠なく「¥100,000稼げます」と出さない。
 * 見積もれないなら unknown を許容し、Scoreも測れた範囲だけで出して
 * coverage を併記する。捏造した数字で行動を促すのが一番まずい。
 */

export type OpportunityCategory =
  | "content"
  | "affiliate"
  | "service"
  | "product"
  | "saas"
  | "consulting"
  | "automation"
  | "other";

export const OPPORTUNITY_CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  content: "コンテンツ販売",
  affiliate: "アフィリエイト",
  service: "サービス提供",
  product: "商品販売",
  saas: "SaaS",
  consulting: "コンサル・受託",
  automation: "自動化の提供",
  other: "その他",
};

/** §56 ライフサイクル */
export type OpportunityStatus =
  | "WATCHING"
  | "CANDIDATE"
  | "RECOMMENDED"
  | "SELECTED"
  | "RUNNING"
  | "VALIDATED"
  | "FAILED"
  | "DISMISSED";

export type OpportunityEvidence = {
  label: string;
  value: number | null;
  unit: string | null;
  /** どこから得た根拠か。追跡できるようにする */
  source: string;
};

/** 見積もれない場合は known: false。0円と区別する */
export type ExpectedRevenue =
  | { known: true; minYen: number; maxYen: number; confidence: number }
  | { known: false; reason: string };

export type RevenueOpportunity = {
  id: string;
  /** §20 重複判定のキー */
  fingerprint: string;

  title: string;
  summary: string;
  category: OpportunityCategory;

  evidence: OpportunityEvidence[];
  expectedRevenue: ExpectedRevenue;
  estimatedEffortMinutes?: number;

  requiredAgents: string[];
  requiredSkills: string[];

  /** 既存資産で賄える度合い（0〜1） */
  existingAssetMatch: number;
  /** 自動化の余地（0〜1） */
  automationPotential: number;

  score: number;
  scoreBreakdown: OpportunityScoreBreakdown;
  /** スコアの何割を実測から出せたか（0〜100） */
  coveragePct: number;

  status: OpportunityStatus;
  /** §55 継続的に稼げるなら後でBusiness Unitへ昇格しうる */
  businessCandidate: boolean;

  /** 実際に収益が出たMission（§57 VALIDATED の根拠） */
  validatedByMissionIds: string[];
  realizedRevenueYen: number;

  createdAt: string;
  updatedAt: string;
};

/** §17 配点。合計100 */
export type OpportunityScoreBreakdown = {
  revenuePotential: number;
  probability: number;
  timeRequired: number;
  existingAssetMatch: number;
  initialCost: number;
  scalability: number;
  automationPotential: number;
};

export const OPPORTUNITY_WEIGHTS: OpportunityScoreBreakdown = {
  revenuePotential: 25,
  probability: 20,
  timeRequired: 15,
  existingAssetMatch: 15,
  initialCost: 10,
  scalability: 10,
  automationPotential: 5,
};

export function opportunityFingerprint(input: {
  category: OpportunityCategory;
  /** 使う資産（note / skill / project など） */
  asset: string;
  /** 収益モデルの識別子 */
  businessModel: string;
}): string {
  return `${input.category}:${input.asset}:${input.businessModel}`;
}
