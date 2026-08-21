import type { ContentPerformance, SocialDraft } from "../research/types";

/** Provider AdapterがApplicationへ返す共通形式。DomainのContentPerformanceはProviderを知らない。 */
export type PerformanceProviderResult =
  | {
      ok: true;
      metrics: ContentPerformance;
      providerUpdatedAt: string;
      externalLink?: string;
      externalPostId?: string;
    }
  | { ok: false; retryable: boolean; error: string };

export type PerformanceProvider = {
  id: "buffer" | "x";
  fetch(draft: SocialDraft, now?: Date): Promise<PerformanceProviderResult>;
};
