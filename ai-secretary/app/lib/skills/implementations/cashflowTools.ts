import { callCashflowTool, type CashflowToolName } from "../../cashflow/client";

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;

export async function runCashflowTool(tool: CashflowToolName, input: Record<string, unknown>): Promise<{ markdown: string; output?: Record<string, unknown> }> {
  if (tool === "get_cashflow_summary") {
    const result = await callCashflowTool("get_cashflow_summary", input);
    const data = result.data;
    const markdown = `## 13週キャッシュフロー\n\n- 現在残高: ${yen(data.currentCash)}\n- 1週間後: ${yen(data.week1Cash)}\n- 1ヶ月後: ${yen(data.month1Cash)}\n- 3ヶ月後: ${yen(data.week13Cash)}\n- 最低残高: ${yen(data.minimumCash)}（Week ${data.minimumCashWeek ?? "-"}）\n- 資金ショート: ${data.hasCashShortage ? `あり（Week ${data.firstCashShortageWeek}）` : "なし"}`;
    return { markdown: `${markdown}\n\nSource: Crestix CF / As of: ${result.asOf}`, output: { source: "crestix-cf", ...result } };
  }
  if (tool === "get_cashflow_week_detail") {
    const result = await callCashflowTool("get_cashflow_week_detail", input);
    const data = result.data;
    const markdown = `## Week ${data.weekNumber}\n\n${data.startDate}〜${data.endDate}\n\n- 期首残高: ${yen(data.openingBalance)}\n- 入金: ${yen(data.totalInflows)}\n- 支払: ${yen(data.totalOutflows)}\n- 純増減: ${yen(data.netChange)}\n- 期末残高: ${yen(data.closingBalance)}`;
    return { markdown: `${markdown}\n\nSource: Crestix CF / As of: ${result.asOf}`, output: { source: "crestix-cf", ...result } };
  }
  if (tool === "get_cashflow_alerts") {
    const result = await callCashflowTool("get_cashflow_alerts", input);
    const markdown = result.data.length ? `## 資金繰りAlert\n\n${result.data.map((alert) => `- [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`).join("\n")}` : "## 資金繰りAlert\n\n現在のAlertはありません。";
    return { markdown: `${markdown}\n\nSource: Crestix CF / As of: ${result.asOf}`, output: { source: "crestix-cf", ...result } };
  }
  const result = await callCashflowTool("simulate_cashflow_scenario", input);
  const data = result.data;
  const markdown = `## Scenario比較（非破壊・一時試算）\n\n- 現在予測 13週後: ${yen(data.base.week13Cash)}\n- Scenario予測 13週後: ${yen(data.scenario.week13Cash)}\n- 差分: ${yen(data.difference.week13CashDifference)}\n- 現在予測 最低残高: ${yen(data.base.minimumCash)}\n- Scenario予測 最低残高: ${yen(data.scenario.minimumCash)}\n- Scenario資金ショート: ${data.scenario.hasCashShortage ? "あり" : "なし"}`;
  return { markdown: `${markdown}\n\nSource: Crestix CF / As of: ${result.asOf}`, output: { source: "crestix-cf", ...result } };
}
