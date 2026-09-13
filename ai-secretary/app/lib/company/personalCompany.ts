/**
 * Personal AI Company の定義 — Phase 4 §1 / §2 / §3 / §42
 *
 * このAI Companyは法人用ではなく、前川個人を1つの会社として運営するもの。
 * 最上位目的は「個人の経済的自由度を最大化する」ことであり、
 * Agent数・Task数・Automation率は手段であって目的ではない。
 *
 * §42 の要請により、Core側に個人固有の値をベタ書きしない。
 * ここは Personal Company の Config であって、
 * 評価ロジック（health / metrics）は profile を引数で受け取る形にしてある。
 * 将来 Business Company Config を足すときは、この型の別インスタンスを作る。
 *
 * §43 のとおり、今はMulti Tenantを作らない。CoreとConfigを分けるだけに留める。
 */

export type NorthStar = "economic_freedom";

export type CompanyGoalId = "first_ai_revenue";

export type PersonalCompanyProfile = {
  id: string;
  name: string;
  mission: string;
  northStar: NorthStar;
  currentGoal: CompanyGoalId;
  /** 最初の到達点。1円でも「AIが稼いだ」という事実が重要 */
  firstRevenueTargetYen: number;
};

export const PERSONAL_COMPANY: PersonalCompanyProfile = {
  id: "personal",
  name: "Maekawa AI Company",
  mission:
    "AIを活用して個人の収益・資産・預貯金・自由時間を増やし、経済的自立を実現する",
  northStar: "economic_freedom",
  currentGoal: "first_ai_revenue",
  firstRevenueTargetYen: 1,
};

/* ─── Revenue Level（§3） ───────────────────────── */

export type RevenueLevel = {
  level: number;
  label: string;
  /** 到達に必要な月次収益（円）。LV9以降は金額では決まらないため null */
  monthlyYen: number | null;
  description: string;
};

/**
 * 収益レベル。
 * 金額のしきい値をUIへ散らさないため、ここ1か所に置く。
 * LV9 / LV10 は金額ではなく「生活費をカバーできているか」で決まる。
 */
export const REVENUE_LEVELS: RevenueLevel[] = [
  { level: 0, label: "LV0", monthlyYen: 0, description: "まだ収益がない" },
  { level: 1, label: "LV1", monthlyYen: 1, description: "AI経由で初めての収益" },
  { level: 2, label: "LV2", monthlyYen: 1_000, description: "月1,000円" },
  { level: 3, label: "LV3", monthlyYen: 10_000, description: "月1万円" },
  { level: 4, label: "LV4", monthlyYen: 30_000, description: "月3万円" },
  { level: 5, label: "LV5", monthlyYen: 100_000, description: "月10万円" },
  { level: 6, label: "LV6", monthlyYen: 300_000, description: "月30万円" },
  { level: 7, label: "LV7", monthlyYen: 500_000, description: "月50万円" },
  { level: 8, label: "LV8", monthlyYen: 1_000_000, description: "月100万円" },
  { level: 9, label: "LV9", monthlyYen: null, description: "副収入・資産所得で生活費を100%カバー" },
  { level: 10, label: "LV10", monthlyYen: null, description: "Financial Independence" },
];

export type LevelResult = {
  level: number;
  label: string;
  description: string;
  /** 次のレベル。最大到達時は null */
  next: RevenueLevel | null;
  /** 次のレベルまでの進捗（0〜1）。判定できなければ null */
  progressToNext: number | null;
};

/**
 * 収益レベルを判定する。
 *
 * LV9 / LV10 は金額ではなくカバー率で決まるため、
 * 生活費データが無いときは金額ベースの判定に留める（推測で上げない）。
 */
export function computeRevenueLevel(input: {
  /** AI経由の月次収益（円）。未測定は null */
  monthlyAiRevenueYen: number | null;
  /** 副収入＋不労所得が生活費に占める割合（0〜1）。未測定は null */
  livingCostCoverageRate?: number | null;
  /** 完全なFIRE達成か。未判定は null */
  financiallyIndependent?: boolean | null;
}): LevelResult {
  const describe = (level: RevenueLevel, progress: number | null): LevelResult => ({
    level: level.level,
    label: level.label,
    description: level.description,
    next: REVENUE_LEVELS.find((l) => l.level === level.level + 1) ?? null,
    progressToNext: progress,
  });

  if (input.financiallyIndependent === true) {
    return describe(REVENUE_LEVELS[10], null);
  }
  if ((input.livingCostCoverageRate ?? 0) >= 1) {
    return describe(REVENUE_LEVELS[9], null);
  }

  // 未測定は「0円」ではない。LV0 に落とすが、進捗は出さない
  if (input.monthlyAiRevenueYen === null) {
    return { ...describe(REVENUE_LEVELS[0], null), description: "収益が未測定" };
  }

  const revenue = input.monthlyAiRevenueYen;
  const moneyLevels = REVENUE_LEVELS.filter((l) => l.monthlyYen !== null);
  const current =
    [...moneyLevels].reverse().find((l) => revenue >= (l.monthlyYen as number)) ??
    REVENUE_LEVELS[0];
  const next = REVENUE_LEVELS.find((l) => l.level === current.level + 1);

  const progress =
    next && next.monthlyYen !== null && next.monthlyYen > 0
      ? Math.min(1, Math.round((revenue / next.monthlyYen) * 100) / 100)
      : null;

  return describe(current, progress);
}
