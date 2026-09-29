export const CASHFLOW_SCHEMA_VERSION = "cashflow:v1" as const;

export type CashflowEnvelope<T> = {
  schemaVersion: typeof CASHFLOW_SCHEMA_VERSION;
  currency: "JPY";
  timezone: "Asia/Tokyo";
  asOf: string;
  generatedAt: string;
  data: T;
};

export type CashflowSummary = {
  currentCash: number;
  week1Cash: number;
  month1Cash: number;
  week13Cash: number;
  minimumCash: number;
  minimumCashWeek: number | null;
  totalInflows: number;
  totalOutflows: number;
  overdueReceivables: number;
  nextLargePayment: { amount: number; date: string; category: string } | null;
  hasCashShortage: boolean;
  firstCashShortageWeek: number | null;
};

export type CashflowEvent = {
  id: string; date: string; description: string; amount: number;
  direction: "in" | "out"; category: string; source: string;
};

export type CashflowWeekDetail = {
  weekNumber: number; startDate: string; endDate: string; openingBalance: number;
  inflows: Record<string, number>; outflows: Record<string, number>;
  totalInflows: number; totalOutflows: number; netChange: number; closingBalance: number;
  inflowItems: CashflowEvent[]; outflowItems: CashflowEvent[];
};

export type CashflowAlert = {
  id: string; severity: "critical" | "warning" | "info";
  type: "cash_shortage" | "minimum_balance" | "overdue_receivable" | "large_payment" | "card_concentration";
  title: string; message: string; weekNumber?: number; amount?: number;
};

export type CashflowScenarioInput = {
  revenueAdjustmentPercent?: number;
  additionalInflows?: Array<{ amount: number; date: string; label?: string }>;
  additionalOutflows?: Array<{ amount: number; date: string; label?: string }>;
  adjustments?: Array<{ sourceId: string; delayDays?: number; amount?: number }>;
};

export type CashflowScenarioResult = {
  base: CashflowSummary;
  scenario: CashflowSummary;
  difference: { week13CashDifference: number; minimumCashDifference: number; totalInflowsDifference: number; totalOutflowsDifference: number; shortageWeek: number | null };
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CF_CONTRACT_INVALID");
  return value as Record<string, unknown>;
};
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value)) throw new Error("CF_CONTRACT_INVALID_MONEY");
  return value as number;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("CF_CONTRACT_INVALID");
  return value;
};

export function parseCashflowEnvelope<T>(value: unknown, parseData: (data: unknown) => T): CashflowEnvelope<T> {
  const row = object(value);
  if (row.schemaVersion !== CASHFLOW_SCHEMA_VERSION || row.currency !== "JPY" || row.timezone !== "Asia/Tokyo") throw new Error("CF_CONTRACT_VERSION_MISMATCH");
  return { schemaVersion: CASHFLOW_SCHEMA_VERSION, currency: "JPY", timezone: "Asia/Tokyo", asOf: text(row.asOf), generatedAt: text(row.generatedAt), data: parseData(row.data) };
}

export function parseSummary(value: unknown): CashflowSummary {
  const row = object(value);
  const nullableWeek = (entry: unknown) => entry === null ? null : integer(entry);
  const next = row.nextLargePayment === null ? null : object(row.nextLargePayment);
  return {
    currentCash: integer(row.currentCash), week1Cash: integer(row.week1Cash), month1Cash: integer(row.month1Cash), week13Cash: integer(row.week13Cash),
    minimumCash: integer(row.minimumCash), minimumCashWeek: nullableWeek(row.minimumCashWeek), totalInflows: integer(row.totalInflows), totalOutflows: integer(row.totalOutflows),
    overdueReceivables: integer(row.overdueReceivables),
    nextLargePayment: next ? { amount: integer(next.amount), date: text(next.date), category: text(next.category) } : null,
    hasCashShortage: Boolean(row.hasCashShortage), firstCashShortageWeek: nullableWeek(row.firstCashShortageWeek),
  };
}

export const parseWeekDetail = (value: unknown): CashflowWeekDetail => object(value) as CashflowWeekDetail;
export const parseAlerts = (value: unknown): CashflowAlert[] => {
  if (!Array.isArray(value)) throw new Error("CF_CONTRACT_INVALID");
  return value.map((item) => object(item) as CashflowAlert);
};
export const parseScenario = (value: unknown): CashflowScenarioResult => {
  const row = object(value);
  return { base: parseSummary(row.base), scenario: parseSummary(row.scenario), difference: object(row.difference) as CashflowScenarioResult["difference"] };
};
