/**
 * 収益の貢献配分 — Phase 6 §62 / §63 / §64
 *
 * §63 の要点: 複数のAI社員が関わった収益を二重計上しない。
 * 単純に「関与したAI社員それぞれに全額」を足すと、
 * 総額を超える貢献額が出て、指標として使えなくなる。
 *
 * Phase 6 では均等配分でよいが、合計が収益総額を超えてはいけない。
 */

import type { RevenueEntry } from "../revenueStore";

export type ContributorType = "agent" | "skill" | "workflow";

export type Contributor = {
  type: ContributorType;
  id: string;
  /** 配分の重み（0〜1）。同じ type の中で合計1になる */
  weight: number;
  amountYen: number;
};

export type RevenueContribution = {
  revenueId: string;
  amountYen: number;
  contributors: Contributor[];
};

/**
 * 1件の収益を貢献者へ配分する。
 *
 * type ごとに独立して配分する（agent で1.0、skill で1.0）。
 * 種別をまたいで合算すると二重計上になるため、集計時も type を分けて見る。
 */
export function attributeRevenue(entry: RevenueEntry): RevenueContribution {
  const contributors: Contributor[] = [];

  const add = (type: ContributorType, ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    const weight = 1 / unique.length;
    for (const id of unique) {
      contributors.push({
        type,
        id,
        weight: Math.round(weight * 1000) / 1000,
        amountYen: Math.round(entry.amountYen * weight),
      });
    }
  };

  add("agent", [entry.originAgentId].filter((v): v is string => Boolean(v)));
  add("skill", [entry.originSkillId].filter((v): v is string => Boolean(v)));
  add("workflow", [entry.originWorkflowId].filter((v): v is string => Boolean(v)));

  return { revenueId: entry.id, amountYen: entry.amountYen, contributors };
}

export type ContributionSummary = {
  byAgent: Record<string, number>;
  bySkill: Record<string, number>;
  byWorkflow: Record<string, number>;
  /** 配分の検算用。収益総額 */
  totalRevenueYen: number;
};

/**
 * 複数の収益を集計する。
 *
 * 種別ごとの合計が収益総額を超えないことが不変条件。
 * 超えていたら配分ロジックが壊れている。
 */
export function summarizeContributions(entries: RevenueEntry[]): ContributionSummary {
  const summary: ContributionSummary = {
    byAgent: {},
    bySkill: {},
    byWorkflow: {},
    totalRevenueYen: 0,
  };

  for (const entry of entries) {
    summary.totalRevenueYen += entry.amountYen;
    const contribution = attributeRevenue(entry);

    for (const contributor of contribution.contributors) {
      const bucket =
        contributor.type === "agent"
          ? summary.byAgent
          : contributor.type === "skill"
            ? summary.bySkill
            : summary.byWorkflow;
      bucket[contributor.id] = (bucket[contributor.id] ?? 0) + contributor.amountYen;
    }
  }

  return summary;
}

/** 検算。種別ごとの合計が総額を超えていないか */
export function isContributionValid(summary: ContributionSummary): boolean {
  const sum = (bucket: Record<string, number>) =>
    Object.values(bucket).reduce((a, b) => a + b, 0);
  // 四捨五入の誤差を許容する
  const tolerance = Object.keys(summary.byAgent).length + Object.keys(summary.bySkill).length + 2;
  return (
    sum(summary.byAgent) <= summary.totalRevenueYen + tolerance &&
    sum(summary.bySkill) <= summary.totalRevenueYen + tolerance &&
    sum(summary.byWorkflow) <= summary.totalRevenueYen + tolerance
  );
}
