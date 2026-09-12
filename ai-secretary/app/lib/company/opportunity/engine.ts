/**
 * Revenue Opportunity Engine — Phase 5 §14 / §15 / §19 / §20 / §46
 *
 * 「今ある資産・Skill・実績から、何をすれば収益になりそうか」を候補化する。
 *
 * §15 の要点: Web検索を必須にしない。内部情報だけで生成できるようにする。
 * §46 の要点: 読み取り専用。公開・送信・取引は一切しない。
 * §19 の要点: 個人固有のサービス名をコードへ大量にハードコードしない。
 *              資産はConfig（Organization Registry / 収益履歴）から取る。
 */

import type { OrganizationSnapshot } from "../organization";
import { DEPARTMENT_GOAL_MAP } from "../departmentGoals";
import { effectiveEntries, type RevenueEntry } from "../revenueStore";
import { categoryPriority, resolveRevenueMode, type RevenueMode } from "../revenueMode";
import { scoreOpportunity } from "./score";
import {
  opportunityFingerprint,
  type OpportunityCategory,
  type OpportunityEvidence,
  type RevenueOpportunity,
} from "./types";

/**
 * 収益機会のカテゴリ → 収益源の対応。
 *
 * OpportunityCategory（何をするか）と RevenueSourceType（どこから入ったか）は
 * 別の分類軸なので、実績を参照するときは必ずここを通す。
 * 直接キーで引くと、content の実績を note の売上から拾えず、
 * 「実績があるのに見込みを出さない」という取りこぼしが起きる。
 */
const CATEGORY_TO_SOURCES: Record<OpportunityCategory, string[]> = {
  content: ["note"],
  affiliate: ["affiliate"],
  service: ["web", "ai_service"],
  product: ["other"],
  saas: ["saas"],
  consulting: ["web", "ai_service"],
  automation: ["ai_service", "saas"],
  other: ["other"],
};

/** そのカテゴリで実際に稼げた累計額 */
function pastRevenueForCategory(
  category: OpportunityCategory,
  byCategory: Record<string, number>
): number {
  return CATEGORY_TO_SOURCES[category].reduce(
    (sum, source) => sum + (byCategory[source] ?? 0),
    0
  );
}

/**
 * 内部資産からの機会の種。
 *
 * ここに個人固有のサービス名を並べない。
 * 「どのAI社員が何をできるか」という構造から機会を導く形にしてある。
 */
type Seed = {
  category: OpportunityCategory;
  asset: string;
  businessModel: string;
  title: (assetLabel: string) => string;
  summary: string;
  /** この機会に必要な目的領域。担当AI社員がいなければ既存資産の活用度が下がる */
  goal: (typeof DEPARTMENT_GOAL_MAP)[number]["goal"];
  automationPotential: number;
  estimatedEffortMinutes: number;
};

const SEEDS: Seed[] = [
  {
    category: "content",
    asset: "published-content",
    businessModel: "paid-article",
    title: (asset) => `${asset}の知見を有料記事にする`,
    summary: "すでに書いた内容と実績を、有料部分を持つ記事として再構成する",
    goal: "media",
    automationPotential: 0.6,
    estimatedEffortMinutes: 90,
  },
  {
    category: "affiliate",
    asset: "published-content",
    businessModel: "affiliate-link",
    title: (asset) => `${asset}にアフィリエイト導線を入れる`,
    summary: "既存の記事に、実際に使っているサービスの紹介を追加する",
    goal: "media",
    automationPotential: 0.7,
    estimatedEffortMinutes: 45,
  },
  {
    category: "automation",
    asset: "internal-workflow",
    businessModel: "template-sale",
    title: (asset) => `${asset}の仕組みをテンプレートとして販売する`,
    summary: "自分用に作った自動化の手順を、他の人が使える形にして売る",
    goal: "business",
    automationPotential: 0.5,
    estimatedEffortMinutes: 180,
  },
  {
    category: "consulting",
    asset: "operating-system",
    businessModel: "advisory",
    title: (asset) => `${asset}の運用ノウハウを個別相談として提供する`,
    summary: "実際に動かしている仕組みの作り方を、対価をもらって教える",
    goal: "business",
    automationPotential: 0.2,
    estimatedEffortMinutes: 60,
  },
];

export type GenerateOptions = {
  organization: OrganizationSnapshot;
  revenueEntries?: RevenueEntry[];
  /** 既存の機会。fingerprint が一致すれば更新する（§20） */
  existing?: RevenueOpportunity[];
  now?: Date;
};

export type OpportunityGenerationResult = {
  opportunities: RevenueOpportunity[];
  mode: RevenueMode;
  /** 過去実績からの学習（§31） */
  learning: {
    pastRevenueByCategory: Record<string, number>;
    pastRevenueByAgent: Record<string, number>;
    pastRevenueByMission: Record<string, number>;
  };
};

/** §31 どのパターンが実際に稼げたかを集計する */
export function summarizePastRevenue(entries: RevenueEntry[]) {
  const effective = effectiveEntries(entries).filter((e) => e.confirmedByHuman);
  const byCategory: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byMission: Record<string, number> = {};

  for (const entry of effective) {
    byCategory[entry.sourceType] = (byCategory[entry.sourceType] ?? 0) + entry.amountYen;
    if (entry.originAgentId) {
      byAgent[entry.originAgentId] = (byAgent[entry.originAgentId] ?? 0) + entry.amountYen;
    }
    if (entry.missionId) {
      byMission[entry.missionId] = (byMission[entry.missionId] ?? 0) + entry.amountYen;
    }
  }

  return {
    pastRevenueByCategory: byCategory,
    pastRevenueByAgent: byAgent,
    pastRevenueByMission: byMission,
  };
}

export function generateOpportunities(options: GenerateOptions): OpportunityGenerationResult {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const entries = options.revenueEntries ?? [];
  const learning = summarizePastRevenue(entries);

  const aiRevenue = effectiveEntries(entries)
    .filter((e) => e.confirmedByHuman && e.sourceType !== "investment")
    .reduce((sum, e) => sum + e.amountYen, 0);
  const mode = resolveRevenueMode(entries.length > 0 ? aiRevenue : null);

  const existingByFingerprint = new Map(
    (options.existing ?? []).map((o) => [o.fingerprint, o])
  );

  const opportunities: RevenueOpportunity[] = SEEDS.map((seed) => {
    const goalMapping = DEPARTMENT_GOAL_MAP.find((m) => m.goal === seed.goal);
    const agents = goalMapping?.agentIds ?? [];
    const skills = options.organization.agents
      .filter((a) => agents.includes(a.id))
      .flatMap((a) => a.skillIds);

    // 担当AI社員がいるほど既存資産で賄える
    const existingAssetMatch = agents.length > 0 ? (skills.length > 0 ? 0.9 : 0.6) : 0.2;

    const evidence: OpportunityEvidence[] = [
      {
        label: "担当できるAI社員",
        value: agents.length,
        unit: "人",
        source: "Organization Registry",
      },
      {
        label: "使えるSkill",
        value: skills.length,
        unit: "件",
        source: "Skill Registry",
      },
      {
        label: `${seed.category} の過去収益`,
        value: pastRevenueForCategory(seed.category, learning.pastRevenueByCategory),
        unit: "円",
        source: `収益台帳（${CATEGORY_TO_SOURCES[seed.category].join(" / ")}）`,
      },
    ];

    /*
     * §18: 根拠が無ければ収益見込みを出さない。
     * 同じカテゴリで実際に稼げた実績があるときだけ金額を出す。
     * 実績ゼロの段階で「¥100,000稼げます」と出すのが一番まずい。
     */
    const past = pastRevenueForCategory(seed.category, learning.pastRevenueByCategory);
    const expectedRevenue =
      past > 0
        ? ({
            known: true as const,
            minYen: Math.round(past * 0.5),
            maxYen: Math.round(past * 1.5),
            confidence: 0.5,
          })
        : ({
            known: false as const,
            reason: "このカテゴリでの実績がまだないため見積もれません",
          });

    const scored = scoreOpportunity({
      expectedRevenue,
      estimatedEffortMinutes: seed.estimatedEffortMinutes,
      existingAssetMatch,
      automationPotential: seed.automationPotential,
    });

    const fingerprint = opportunityFingerprint({
      category: seed.category,
      asset: seed.asset,
      businessModel: seed.businessModel,
    });
    const previous = existingByFingerprint.get(fingerprint);

    // モードに応じた優先度で status を決める
    const priority = categoryPriority(seed.category, mode);
    const status =
      previous?.status === "VALIDATED" || previous?.status === "DISMISSED"
        ? previous.status
        : scored.coveragePct < 50
          ? "WATCHING"
          : priority <= 2
            ? "RECOMMENDED"
            : "CANDIDATE";

    return {
      id: previous?.id ?? `opp_${fingerprint.replace(/[^A-Za-z0-9]/g, "_")}`,
      fingerprint,
      title: seed.title(goalMapping ? goalMapping.contribution.split("（")[0] : seed.asset),
      summary: seed.summary,
      category: seed.category,
      evidence,
      expectedRevenue,
      estimatedEffortMinutes: seed.estimatedEffortMinutes,
      requiredAgents: agents,
      requiredSkills: skills,
      existingAssetMatch,
      automationPotential: seed.automationPotential,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      coveragePct: scored.coveragePct,
      status,
      businessCandidate: seed.category === "saas" || seed.category === "product",
      validatedByMissionIds: previous?.validatedByMissionIds ?? [],
      realizedRevenueYen: previous?.realizedRevenueYen ?? 0,
      createdAt: previous?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
  });

  // モードに沿って並べる。最初の1円モードでは軽いものが上に来る
  opportunities.sort(
    (a, b) =>
      categoryPriority(a.category, mode) - categoryPriority(b.category, mode) ||
      b.score - a.score
  );

  return { opportunities, mode, learning };
}

/**
 * §57 実際に収益が出たら VALIDATED にする。
 * 収益が出ていないMissionの完了では VALIDATED にしない（§53 / Test G）。
 */
export function applyRevenueToOpportunities(
  opportunities: RevenueOpportunity[],
  entries: RevenueEntry[],
  now: Date = new Date()
): RevenueOpportunity[] {
  const confirmed = effectiveEntries(entries).filter(
    (e) => e.confirmedByHuman && e.sourceType !== "investment" && e.opportunityId
  );

  return opportunities.map((opportunity) => {
    const linked = confirmed.filter((e) => e.opportunityId === opportunity.id);
    if (linked.length === 0) return opportunity;

    const realized = linked.reduce((sum, e) => sum + e.amountYen, 0);
    return {
      ...opportunity,
      status: realized > 0 ? "VALIDATED" : opportunity.status,
      realizedRevenueYen: realized,
      validatedByMissionIds: [
        ...new Set([
          ...opportunity.validatedByMissionIds,
          ...linked.map((e) => e.missionId).filter((id): id is string => Boolean(id)),
        ]),
      ],
      updatedAt: now.toISOString(),
    };
  });
}
