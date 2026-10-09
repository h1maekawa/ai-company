import { createHash } from "node:crypto";
import type { ResearchSourceType } from "./research/types";

export type StoreAuthority = "AI" | "SYSTEM" | "HUMAN" | "PROVIDER";

export type CanonicalSourceIdentity = {
  sourceKey: string;
  sourceType: ResearchSourceType;
  canonicalUrl?: string;
  provider?: string;
  publishedAt?: string;
  observedAt: string;
  fingerprint?: string;
};

export type DomainEvidenceReference = {
  domain: "company" | "content" | "investment";
  domainId: string;
  sourceKey: string;
};

export type CanonicalSourceInput = Omit<CanonicalSourceIdentity, "sourceKey" | "canonicalUrl"> & {
  canonicalUrl?: string;
  providerEvidenceId?: string;
};

function normalizedUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return undefined;
  }
}

const digest = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 24);

/** Stable across stores: URL first, then provider evidence identity, then an existing fingerprint. */
export function canonicalSourceIdentity(input: CanonicalSourceInput): CanonicalSourceIdentity {
  const canonicalUrl = normalizedUrl(input.canonicalUrl);
  const providerIdentity = input.provider && input.providerEvidenceId
    ? `${input.provider.trim().toLowerCase()}:${input.providerEvidenceId.trim()}`
    : undefined;
  const identity = canonicalUrl ? `url:${canonicalUrl}`
    : providerIdentity ? `provider:${providerIdentity}`
    : input.fingerprint ? `fingerprint:${input.fingerprint.trim()}`
    : undefined;
  if (!identity) throw new Error("CANONICAL_SOURCE_IDENTITY_REQUIRED");
  return {
    sourceKey: `source_${digest(`${input.sourceType}|${identity}`)}`,
    sourceType: input.sourceType,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    observedAt: input.observedAt,
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
  };
}

export type RevenueAttributionRelation = "linked" | "attribution-only" | "unresolved";
export type RevenueAttributionLink = {
  revenueEventId: string;
  companyRevenueId?: string;
  relation: RevenueAttributionRelation;
  observedAt: string;
};

/** Legacy unlinked events remain unresolved unless a caller supplies an explicit attribution-only decision. */
export function revenueAttributionLink(input: {
  revenueEventId: string;
  companyRevenueId?: string;
  relation?: Exclude<RevenueAttributionRelation, "linked">;
  observedAt: string;
}): RevenueAttributionLink {
  if (input.companyRevenueId) {
    return { revenueEventId: input.revenueEventId, companyRevenueId: input.companyRevenueId, relation: "linked", observedAt: input.observedAt };
  }
  return { revenueEventId: input.revenueEventId, relation: input.relation ?? "unresolved", observedAt: input.observedAt };
}

export type RevenueIngestionIdentity = {
  source: string;
  externalReference: string;
  amount: number;
  occurredAt: string;
};

export function revenueIdempotencyKey(input: RevenueIngestionIdentity): string {
  if (!input.source.trim() || !input.externalReference.trim() || !Number.isFinite(input.amount) || !input.occurredAt.trim()) {
    throw new Error("REVENUE_IDEMPOTENCY_IDENTITY_INCOMPLETE");
  }
  return `revenue_${digest(`${input.source.trim().toLowerCase()}|${input.externalReference.trim()}|${input.amount}|${input.occurredAt}`)}`;
}

export type CanonicalLearningDomain = "content" | "investment" | "company";
export type CanonicalLearningKind = "observation" | "interpretation" | "hypothesis" | "experiment" | "learning" | "strategy-change";
export type CanonicalLearningStatus = "candidate" | "approved" | "rejected" | "superseded";
export type CanonicalLearningEnvelope<TPayload = unknown> = {
  id: string;
  domain: CanonicalLearningDomain;
  kind: CanonicalLearningKind;
  status: CanonicalLearningStatus;
  evidenceRefs: string[];
  confidence?: number;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  payload?: TPayload;
};

export function createCanonicalLearningCandidate<TPayload>(
  input: Omit<CanonicalLearningEnvelope<TPayload>, "status" | "approvedAt" | "approvedBy">
): CanonicalLearningEnvelope<TPayload> {
  return { ...input, status: "candidate" };
}

export function isApprovedLearning(value: CanonicalLearningEnvelope): boolean {
  return value.status === "approved" && Boolean(value.approvedAt && value.approvedBy);
}

export type PerformanceIdentity = {
  platform: "x" | "note" | "instagram";
  contentId: string;
  publishedContentId?: string;
  observedAt?: string;
};

export type PublishApprovalProof = {
  approvalId: string;
  contentId: string;
  scope: "paid-note" | "high-risk-publish";
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string;
  issuer: "server";
};

export type StoreAuthorityContract = {
  store: string;
  create: StoreAuthority[];
  update: StoreAuthority[];
  approve: StoreAuthority[];
  delete: StoreAuthority[];
  readConsumers: string[];
};
