import { callCashflowTool } from "./client";
import { runCashflowTool } from "../skills/implementations/cashflowTools";

export type CashflowQuestionAnswer = { skillId: string; markdown: string; output?: Record<string, unknown> };

function amountFromJapanese(text: string): number | null {
  const match = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(億|万)?円/);
  if (!match) return null;
  const multiplier = match[2] === "億" ? 100_000_000 : match[2] === "万" ? 10_000 : 1;
  const amount = Number(match[1]) * multiplier;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function isCashflowQuestion(message: string): boolean {
  return /(13週|\d{1,2}週目|キャッシュフロー|cash\s*flow|現預金|資金ショート|最低残高|未回収|大型支払|何週目|週目.*残高|残高.*週目)/i.test(message);
}

export async function answerCashflowQuestion(message: string): Promise<CashflowQuestionAnswer | null> {
  if (!isCashflowQuestion(message)) return null;
  const week = message.match(/(?:week\s*|第?)(1[0-3]|[1-9])\s*週?/i)?.[1];
  if (week && /(なぜ|内訳|支払|入金|詳細)/.test(message)) {
    const result = await runCashflowTool("get_cashflow_week_detail", { weekNumber: Number(week) });
    return { skillId: "get_cashflow_week_detail", ...result };
  }
  if (/(リスク|alert|アラート|未回収|大型支払|危険)/i.test(message)) {
    const result = await runCashflowTool("get_cashflow_alerts", {});
    return { skillId: "get_cashflow_alerts", ...result };
  }
  if (/(追加|使ったら|減ったら|減少|遅れたら|scenario|シナリオ)/i.test(message)) {
    const input: Record<string, unknown> = {};
    const percent = message.match(/(?:売上|収入)[^\d]{0,8}(\d+(?:\.\d+)?)\s*%\s*(?:減|下)/)?.[1];
    if (percent) input.revenueAdjustmentPercent = -Number(percent);
    const amount = amountFromJapanese(message);
    if (amount && /(採用|支払|費用|使|投資)/.test(message)) {
      const summary = await callCashflowTool("get_cashflow_summary", {});
      input.additionalOutflows = [{ amount, date: summary.asOf, label: "AI質問からの追加支出" }];
    }
    if (amount && /(入金|追加投資|資金注入)/.test(message)) {
      const summary = await callCashflowTool("get_cashflow_summary", {});
      input.additionalInflows = [{ amount, date: summary.asOf, label: "AI質問からの追加入金" }];
    }
    if (Object.keys(input).length === 0) return { skillId: "simulate_cashflow_scenario", markdown: "Scenario条件を特定できません。金額・増減率・日付を明示してください。" };
    const result = await runCashflowTool("simulate_cashflow_scenario", input);
    return { skillId: "simulate_cashflow_scenario", ...result };
  }
  const result = await runCashflowTool("get_cashflow_summary", {});
  return { skillId: "get_cashflow_summary", ...result };
}
