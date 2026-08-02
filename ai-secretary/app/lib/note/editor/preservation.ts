import type { LocalAiReviewInput, LocalAiReviewResult } from "./types";

export type PreservationIssue = {
  field: "number" | "url" | "expression" | "score";
  severity: "error" | "warning";
  value: string;
  message: string;
};

const URL_PATTERN = /https?:\/\/[^\s)\]"'）]+/g;
const NUMBER_PATTERN =
  /(?:[$¥￥]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*(?:円|万円|億円|%|％|時間|分|秒|件|人|冊|回|日|月|年|株))?/g;

function tokens(text: string, pattern: RegExp): string[] {
  return Array.from(new Set(text.match(pattern) ?? []));
}

function normalizedFacts(input: LocalAiReviewInput): string {
  return [input.originalText, ...input.additionalFacts].join("\n");
}

/**
 * Local AIが元原稿や明示された事実にない数値・URLを追加していないか検証する。
 * 固有名詞は機械判定が不安定なため、「残したい表現」を完全一致で保護する。
 */
export function validatePreservation(
  input: LocalAiReviewInput,
  result: LocalAiReviewResult
): PreservationIssue[] {
  const issues: PreservationIssue[] = [];
  const source = normalizedFacts(input);
  const revised = result.revisedText;

  const allowedNumbers = new Set(tokens(source, NUMBER_PATTERN));
  for (const value of tokens(revised, NUMBER_PATTERN)) {
    if (!allowedNumbers.has(value)) {
      issues.push({
        field: "number",
        severity: "error",
        value,
        message: `元原稿・追加事実にない数値「${value}」が追加されています`,
      });
    }
  }

  const allowedUrls = new Set(tokens(source, URL_PATTERN));
  for (const value of tokens(revised, URL_PATTERN)) {
    if (!allowedUrls.has(value)) {
      issues.push({
        field: "url",
        severity: "error",
        value,
        message: `元原稿・追加事実にないURL「${value}」が追加されています`,
      });
    }
  }

  for (const expression of input.keepExpressions.map((value) => value.trim()).filter(Boolean)) {
    if (!revised.includes(expression)) {
      issues.push({
        field: "expression",
        severity: "error",
        value: expression,
        message: `残したい表現「${expression}」が変更または削除されています`,
      });
    }
  }

  const scores = [
    result.score.brandFit,
    result.score.usefulness,
    result.score.originality,
    result.score.readability,
    result.score.reliability,
  ];
  if (
    scores.some((score) => !Number.isInteger(score) || score < 0 || score > 5) ||
    result.score.total !== scores.reduce((sum, score) => sum + score, 0)
  ) {
    issues.push({
      field: "score",
      severity: "error",
      value: String(result.score.total),
      message: "品質評価が25点満点の規則と一致していません",
    });
  }

  return issues;
}

