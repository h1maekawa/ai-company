import { parseAlerts, parseCashflowEnvelope, parseScenario, parseSummary, parseWeekDetail, type CashflowAlert, type CashflowEnvelope, type CashflowScenarioInput, type CashflowScenarioResult, type CashflowSummary, type CashflowWeekDetail } from "./contract";

export type CashflowToolName = "get_cashflow_summary" | "get_cashflow_week_detail" | "get_cashflow_alerts" | "simulate_cashflow_scenario";

export class CashflowClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "CashflowClientError"; }
}

const MOCK_SUMMARY = { currentCash: 8_420_000, week1Cash: 8_900_000, month1Cash: 5_920_000, week13Cash: 6_300_000, minimumCash: 820_000, minimumCashWeek: 6, totalInflows: 12_800_000, totalOutflows: 14_920_000, overdueReceivables: 1_800_000, nextLargePayment: { amount: 3_200_000, date: "2026-10-12", category: "payroll" }, hasCashShortage: false, firstCashShortageWeek: null };
const mockEnvelope = (data: unknown) => ({ schemaVersion: "cashflow:v1", currency: "JPY", timezone: "Asia/Tokyo", asOf: "2026-09-25", generatedAt: "2026-09-25T01:32:00.000Z", data });

function mock(tool: CashflowToolName, input: Record<string, unknown>): unknown {
  if (tool === "get_cashflow_summary") return mockEnvelope(MOCK_SUMMARY);
  if (tool === "get_cashflow_week_detail") return mockEnvelope({ weekNumber: Number(input.weekNumber), startDate: "2026-10-12", endDate: "2026-10-18", openingBalance: 8_420_000, inflows: { receivables: 1_700_000, other_income: 0 }, outflows: { payroll: 3_200_000, card: 820_000, other_payment: 180_000 }, totalInflows: 1_700_000, totalOutflows: 4_200_000, netChange: -2_500_000, closingBalance: 5_920_000, inflowItems: [], outflowItems: [] });
  if (tool === "get_cashflow_alerts") return mockEnvelope([{ id: "minimum-6", severity: "warning", type: "minimum_balance", title: "最低残高が閾値を下回ります", message: "Week 6", weekNumber: 6, amount: 820_000 }]);
  const scenarioInput = input as CashflowScenarioInput;
  const isHiringFixture = scenarioInput.additionalOutflows?.length === 1 && scenarioInput.additionalOutflows[0]?.amount === 3_000_000;
  const isRevenueFixture = scenarioInput.revenueAdjustmentPercent === -20;
  if (!isHiringFixture && !isRevenueFixture) throw new CashflowClientError("MOCK_SCENARIO_NOT_FOUND", "No deterministic CF fixture matches this scenario.");
  // These are fixed CF contract fixtures, not an AI-side forecast calculation.
  const fixture = isHiringFixture
    ? { delta: -3_000_000, inflowDifference: 0, outflowDifference: 3_000_000, week13Cash: 3_300_000, minimumCash: -2_180_000 }
    : { delta: -2_560_000, inflowDifference: -2_560_000, outflowDifference: 0, week13Cash: 3_740_000, minimumCash: -1_740_000 };
  const scenario = { ...MOCK_SUMMARY, week13Cash: fixture.week13Cash, minimumCash: fixture.minimumCash, hasCashShortage: true, firstCashShortageWeek: 1 };
  return mockEnvelope({ base: MOCK_SUMMARY, scenario, difference: { week13CashDifference: fixture.delta, minimumCashDifference: fixture.delta, totalInflowsDifference: fixture.inflowDifference, totalOutflowsDifference: fixture.outflowDifference, shortageWeek: 1 } });
}

export function callCashflowTool(tool: "get_cashflow_summary", input?: Record<string, unknown>): Promise<CashflowEnvelope<CashflowSummary>>;
export function callCashflowTool(tool: "get_cashflow_week_detail", input?: Record<string, unknown>): Promise<CashflowEnvelope<CashflowWeekDetail>>;
export function callCashflowTool(tool: "get_cashflow_alerts", input?: Record<string, unknown>): Promise<CashflowEnvelope<CashflowAlert[]>>;
export function callCashflowTool(tool: "simulate_cashflow_scenario", input?: Record<string, unknown>): Promise<CashflowEnvelope<CashflowScenarioResult>>;
export async function callCashflowTool(tool: CashflowToolName, input: Record<string, unknown> = {}) {
  const mode = process.env.CRESTIX_CF_MODE ?? "disabled";
  let payload: unknown;
  if (mode === "mock") payload = mock(tool, input);
  else if (mode === "remote") {
    const baseUrl = process.env.CRESTIX_CF_SERVICE_URL;
    const secret = process.env.CRESTIX_CF_SERVICE_TOKEN;
    if (!baseUrl || !secret) throw new CashflowClientError("CF_NOT_CONFIGURED", "Crestix CF service is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/cashflow/${tool}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(input), cache: "no-store", signal: controller.signal });
      if (response.status === 401) throw new CashflowClientError("NOT_AUTHENTICATED", "CF service authentication failed.");
      if (response.status === 403) throw new CashflowClientError("NOT_AUTHORIZED", "CF company authorization failed.");
      if (!response.ok) throw new CashflowClientError("CF_DATA_UNAVAILABLE", `CF service returned ${response.status}.`);
      payload = await response.json();
    } catch (error) {
      if (error instanceof CashflowClientError) throw error;
      throw new CashflowClientError("CF_DATA_UNAVAILABLE", error instanceof Error ? error.message : "CF request failed.");
    } finally { clearTimeout(timeout); }
  } else throw new CashflowClientError("CF_NOT_CONFIGURED", "Crestix CF integration is disabled.");

  if (tool === "get_cashflow_summary") return parseCashflowEnvelope(payload, parseSummary);
  if (tool === "get_cashflow_week_detail") return parseCashflowEnvelope(payload, parseWeekDetail);
  if (tool === "get_cashflow_alerts") return parseCashflowEnvelope(payload, parseAlerts);
  return parseCashflowEnvelope(payload, parseScenario);
}
