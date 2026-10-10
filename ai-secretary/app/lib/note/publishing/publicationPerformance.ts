import type { ContentPerformance, SocialDraft } from "../research/types";
import { normalizeBufferMetrics } from "./bufferMetrics";
import type { BufferPostMetrics, BufferPostPublicationEvidence } from "./buffer";
import { confirmXPublication, type CanaryPublicationReason } from "./canaryReconciliation";

export type PublicationPerformanceResult =
  | { ok: false; reason: CanaryPublicationReason }
  | {
      ok: true;
      draft: SocialDraft;
      record: ContentPerformance;
      metricsAvailable: boolean;
      preservedExistingMetrics: boolean;
    };

/**
 * Reconcile provider publication truth independently from optional metrics.
 * An unavailable metrics read never rolls a confirmed publication back and
 * never replaces an already observed record with missing values.
 */
export function reconcilePublicationPerformance(input: {
  draft: SocialDraft;
  existingRecord?: ContentPerformance;
  evidence: BufferPostPublicationEvidence;
  metricsPost: BufferPostMetrics | null;
  measuredAt: Date;
}): PublicationPerformanceResult {
  const publication = confirmXPublication(input.draft, input.evidence);
  if (publication.ok === false) return { ok: false, reason: publication.reason };

  const metricsRecord = input.metricsPost?.metricsUpdatedAt && Array.isArray(input.metricsPost.metrics)
    ? normalizeBufferMetrics(
        publication.draft,
        { ...input.evidence, ...input.metricsPost },
        input.measuredAt
      )
    : null;
  if (metricsRecord) {
    return {
      ok: true,
      draft: {
        ...publication.draft,
        bufferMetricsUpdatedAt: input.metricsPost?.metricsUpdatedAt ?? input.evidence.sentAt,
      },
      record: metricsRecord,
      metricsAvailable: true,
      preservedExistingMetrics: false,
    };
  }

  if (input.existingRecord) {
    return {
      ok: true,
      draft: publication.draft,
      record: input.existingRecord,
      metricsAvailable: false,
      preservedExistingMetrics: true,
    };
  }

  const unavailable = normalizeBufferMetrics(
    publication.draft,
    { ...input.evidence, metrics: null, metricsUpdatedAt: null },
    input.measuredAt,
    true
  );
  if (!unavailable) throw new Error("Publication evidence could not be normalized");
  return {
    ok: true,
    draft: publication.draft,
    record: unavailable,
    metricsAvailable: false,
    preservedExistingMetrics: false,
  };
}
