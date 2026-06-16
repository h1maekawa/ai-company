import { callGroq } from "../ai/groq";

/**
 * Calculates ROI (Return on Investment) percentage
 */
export function calculateROI(cost: number, revenue: number): number {
  if (cost === 0) return 0;
  return ((revenue - cost) / cost) * 100;
}

/**
 * CFO evaluates an investment allocation
 */
export async function evaluateInvestment(ticker: string, amount: number): Promise<string> {
  const prompt = `あなたは「AI Company OS」のCFO（最高財務責任者）です。
銘柄（${ticker}）に対して、投資額（${amount}円）を投資することの妥当性を評価し、アセットアロケーションとリスク管理の観点からアドバイスをください。
2〜3文の簡潔な日本語で回答してください。`;

  try {
    return await callGroq("", prompt);
  } catch (e) {
    console.error("[DEBUG] CFO evaluateInvestment failed:", e);
    return "投資評価中にエラーが発生しました。";
  }
}

/**
 * CFO provides advice on current cashposition / re-investment ratios
 */
export async function cashflowAdvice(balance: number): Promise<string> {
  const prompt = `あなたは「AI Company OS」のCFO（最高財務責任者）です。
現在の会社および個人のキャッシュポジション（残高：${balance}円）に基づき、キャッシュフローを安定させ、再投資比率を最適化するためのアドバイスをください。
リスク管理と安全性重視で、2〜3文の簡潔な日本語で回答してください。`;

  try {
    return await callGroq("", prompt);
  } catch (e) {
    console.error("[DEBUG] CFO cashflowAdvice failed:", e);
    return "キャッシュフローアドバイス中にエラーが発生しました。";
  }
}
