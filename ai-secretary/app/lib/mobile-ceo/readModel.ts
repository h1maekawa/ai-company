export type AvailabilityMetric = { label: string; value: number | null; unit?: string };

export type CeoSourcePayloads = {
  dashboard?: Record<string, any> | null;
  approvals?: Record<string, any> | null;
  opportunities?: Record<string, any> | null;
  content?: Record<string, any> | null;
  recommendations?: Record<string, any> | null;
  decisions?: Record<string, any> | null;
  transactions?: Record<string, any> | null;
  engineering?: Record<string, any> | null;
};

export type CeoAttentionItem = {
  id: string;
  kind: "approval" | "fund" | "engineering" | "creator";
  title: string;
  href: string;
};

const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const countOrUnknown = (source: unknown, value: unknown): number | null => source ? array(value).length : null;

/** Existing SSOT responses are projected for display only; no business decision is made here. */
export function buildCeoReadModel(input: CeoSourcePayloads) {
  const pending = array(input.approvals?.pending);
  const recommendations = array(input.recommendations?.recommendations);
  const engineeringItems = array(input.engineering?.items);
  const opportunities = array(input.opportunities?.opportunities);
  const topFund = recommendations.find((item) => item?.action !== "HOLD") ?? recommendations[0] ?? null;

  const attention: CeoAttentionItem[] = [
    ...pending.slice(0, 4).map((item, index) => ({
      id: `approval-${String(item?.id ?? index)}`,
      kind: "approval" as const,
      title: String(item?.title ?? item?.actionType ?? "承認待ち"),
      href: "/ceo/approvals",
    })),
    ...(topFund && (topFund.action === "WAIT_DATA" || topFund.executionBlocked) ? [{
      id: `fund-${String(topFund.id ?? "latest")}`,
      kind: "fund" as const,
      title: `${String(topFund.ticker ?? "Fund")} ${String(topFund.action ?? "要確認")}`,
      href: "/investing",
    }] : []),
    ...engineeringItems.filter((item) => item?.status === "BLOCKED" || item?.status === "FAILED").slice(0, 3).map((item, index) => ({
      id: `engineering-${String(item?.issueNumber ?? index)}`,
      kind: "engineering" as const,
      title: String(item?.title ?? "Engineering要確認"),
      href: "/admin",
    })),
  ];

  return {
    metrics: [
      { label: "承認待ち", value: countOrUnknown(input.approvals, input.approvals?.pending) },
      { label: "収益機会", value: countOrUnknown(input.opportunities, input.opportunities?.opportunities) },
      { label: "Fund候補", value: countOrUnknown(input.recommendations, input.recommendations?.recommendations) },
      { label: "Engineering", value: countOrUnknown(input.engineering, input.engineering?.items) },
    ] satisfies AvailabilityMetric[],
    attention,
    creator: {
      opportunities: countOrUnknown(input.opportunities, opportunities),
      published: typeof input.content?.publishedCount === "number" ? input.content.publishedCount : null,
      revenueYen: typeof input.content?.revenue === "number" ? input.content.revenue : null,
    },
    fund: {
      recommendation: topFund,
      decisions: countOrUnknown(input.decisions, input.decisions?.decisions),
      transactions: countOrUnknown(input.transactions, input.transactions?.transactions),
      executionAuthority: "HUMAN_ONLY" as const,
      aiExecutionAllowed: false as const,
    },
    engineering: {
      available: input.engineering?.available === true,
      items: input.engineering?.available === true ? engineeringItems.length : null,
    },
  };
}
