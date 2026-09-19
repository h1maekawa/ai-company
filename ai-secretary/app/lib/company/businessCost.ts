/**
 * Creator / Business Cost の会計契約。
 *
 * Execution Cost（LLM/API推定USD）とは別責務。ここでは人間が確認した
 * Creator事業の実費だけをAppend-onlyで記録する。
 */

export const BUSINESS_COST_CATEGORIES = [
  "advertising",
  "platform_fee",
  "outsourcing",
  "saas",
  "api",
  "production",
  "paid_asset",
  "other",
] as const;
const BUSINESS_COST_ENTRY_KINDS = ["cost", "correction", "reversal"] as const;

export type BusinessCostCategory = (typeof BUSINESS_COST_CATEGORIES)[number];
export type BusinessCostEntryKind = "cost" | "correction" | "reversal";

export type BusinessCostEntry = {
  id: string;
  kind: BusinessCostEntryKind;
  amountYen: number;
  category: BusinessCostCategory;
  correctsId?: string;

  missionId?: string;
  opportunityId?: string;
  contentId?: string;
  sourceKnowledgeId?: string;
  businessId?: string;

  originAgentId?: string;
  originSkillId?: string;
  originWorkflowId?: string;
  originTraceId?: string;

  occurredAt: string;
  confirmedByHuman: boolean;
  note?: string;
  createdAt: string;
};

export type BusinessCostValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateBusinessCostInput(
  input: Partial<BusinessCostEntry>
): BusinessCostValidation {
  if (input.kind && !BUSINESS_COST_ENTRY_KINDS.includes(input.kind)) {
    return { ok: false, error: "Cost Entry種別が不正です" };
  }
  if (typeof input.amountYen !== "number" || !Number.isFinite(input.amountYen)) {
    return { ok: false, error: "金額は数値で指定してください" };
  }
  if (input.amountYen <= 0) {
    return { ok: false, error: "金額は0より大きい値にしてください" };
  }
  if (!input.category || !BUSINESS_COST_CATEGORIES.includes(input.category)) {
    return {
      ok: false,
      error: `カテゴリが不正です（${BUSINESS_COST_CATEGORIES.join(" / ")}）`,
    };
  }
  if (typeof input.confirmedByHuman !== "boolean") {
    return { ok: false, error: "confirmedByHuman を明示してください" };
  }
  if (
    (input.kind === "correction" || input.kind === "reversal") &&
    !input.correctsId
  ) {
    return { ok: false, error: "修正・取消には対象Cost IDが必要です" };
  }
  return { ok: true };
}

export function createBusinessCostEntry(
  input: Omit<BusinessCostEntry, "id" | "createdAt" | "kind"> & {
    kind?: BusinessCostEntryKind;
  },
  now: Date = new Date()
): BusinessCostEntry {
  return {
    ...input,
    kind: input.kind ?? "cost",
    id: `cost_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(),
  };
}

/** 履歴を消さず、取消・最新修正を反映した実効Costを返す。 */
export function effectiveBusinessCostEntries(
  entries: BusinessCostEntry[]
): BusinessCostEntry[] {
  const reversed = new Set(
    entries
      .filter((entry) => entry.kind === "reversal" && entry.correctsId)
      .map((entry) => entry.correctsId as string)
  );
  const correctedBy = new Map<string, BusinessCostEntry>();
  for (const entry of entries) {
    if (entry.kind === "correction" && entry.correctsId) {
      correctedBy.set(entry.correctsId, entry);
    }
  }

  return entries
    .filter((entry) => entry.kind === "cost")
    .filter((entry) => !reversed.has(entry.id))
    .map((entry) => {
      const correction = correctedBy.get(entry.id);
      return correction ? { ...entry, ...correction } : entry;
    });
}
