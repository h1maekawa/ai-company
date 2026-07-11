import { SkillImplementationOutput } from "./personalCapture";
import { todayJstDateString } from "./dateUtil";

export type FundLogFormatInput = {
  ticker?: string;
  companyName?: string;
  action?: string;
  decisionScore?: number | string;
  reason?: string;
  risk?: string;
  timeHorizon?: string;
  positionSize?: string;
  memo?: string;
};

function orDash(value: unknown): string {
  if (value === undefined || value === null) return "-";
  const str = String(value).trim();
  return str ? str : "-";
}

/**
 * fund-log-format — 投資判断を投資判断ログとして保存しやすいMarkdownへ整形するSkill。
 * 既存 /api/fund/log のMarkdown形式（テーブル・絵文字ラベル）とは別の、より簡潔なフォーマット。
 * このPhaseでは両者を統合しない（既存APIレスポンス形式は変更しない）。Memory保存も行わない。
 */
export function runFundLogFormat(input: Record<string, unknown>): SkillImplementationOutput {
  const {
    ticker,
    companyName,
    action,
    decisionScore,
    reason,
    risk,
    timeHorizon,
    positionSize,
    memo,
  } = input as FundLogFormatInput;

  const warnings: string[] = [];
  if (!ticker || typeof ticker !== "string" || !ticker.trim()) {
    warnings.push("ticker が空です。");
  }

  const safeTicker = typeof ticker === "string" && ticker.trim() ? ticker.trim().toUpperCase() : "-";

  const markdown = `# 投資判断ログ

- Date: ${todayJstDateString()}
- Ticker: ${safeTicker}
- Company: ${orDash(companyName)}
- Action: ${orDash(action)}
- Decision Score: ${orDash(decisionScore)}
- Time Horizon: ${orDash(timeHorizon)}
- Position Size: ${orDash(positionSize)}

## 判断理由
${orDash(reason)}

## リスク
${orDash(risk)}

## メモ
${orDash(memo)}
`;

  return {
    markdown,
    output: { ticker: safeTicker, action: orDash(action), date: todayJstDateString() },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
