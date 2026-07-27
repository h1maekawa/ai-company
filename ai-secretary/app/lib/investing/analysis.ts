/**
 * ポートフォリオ分析。
 *
 * 健全性スコアは決定的に計算する（同じ保有なら毎回同じ点数になるように）。
 * LLMは点数を作らず、算出済みの事実をもとにコメントと次の一手を書く役割に限定する。
 */

import { callAI } from "../ai/client";
import { Portfolio, Position } from "./types";

export type HealthFactor = {
  label: string;
  /** 0-100。高いほど良い */
  score: number;
  detail: string;
  status: "good" | "warn" | "bad";
};

export type PortfolioHealth = {
  /** 0-100 */
  score: number;
  grade: "優" | "良好" | "要注意" | "要改善";
  factors: HealthFactor[];
};

function statusOf(score: number): HealthFactor["status"] {
  if (score >= 70) return "good";
  if (score >= 45) return "warn";
  return "bad";
}

/** 単一銘柄への集中度（最大構成比）。低いほど良い */
function concentrationFactor(positions: Position[], total: number): HealthFactor {
  const valued = positions.filter((p) => p.marketValueJpy !== null);
  if (valued.length === 0 || total <= 0) {
    return { label: "銘柄集中度", score: 50, detail: "評価額が取得できていません", status: "warn" };
  }
  const top = Math.max(...valued.map((p) => (p.marketValueJpy ?? 0) / total)) * 100;
  // 25%以下なら満点、60%以上で0点
  const score = Math.max(0, Math.min(100, ((60 - top) / 35) * 100));
  return {
    label: "銘柄集中度",
    score,
    detail: `最大構成比 ${top.toFixed(1)}%`,
    status: statusOf(score),
  };
}

/** 資産クラスの分散。1クラスに寄っているほど低い */
function diversificationFactor(portfolio: Portfolio): HealthFactor {
  const allocation = portfolio.summary.allocation;
  if (allocation.length === 0) {
    return { label: "資産クラス分散", score: 50, detail: "内訳を取得できていません", status: "warn" };
  }
  const maxPct = Math.max(...allocation.map((a) => a.pct));
  // 50%以下なら満点、90%以上で0点
  const score = Math.max(0, Math.min(100, ((90 - maxPct) / 40) * 100));
  const top = allocation[0];
  return {
    label: "資産クラス分散",
    score,
    detail: `${top.label}が ${top.pct.toFixed(1)}%`,
    status: statusOf(score),
  };
}

/** 銘柄数。少なすぎると個別リスクが高い */
function breadthFactor(positions: Position[]): HealthFactor {
  const count = positions.length;
  const score = Math.max(0, Math.min(100, ((count - 2) / 8) * 100));
  return {
    label: "保有銘柄数",
    score,
    detail: `${count}銘柄`,
    status: statusOf(score),
  };
}

/** 現金比率。未設定なら評価対象から外す */
function cashFactor(portfolio: Portfolio): HealthFactor | null {
  const cash = portfolio.summary.cashJpy;
  const total = portfolio.summary.totalValueJpy;
  if (cash === null || total === null || total <= 0) return null;

  const pct = (cash / (total + cash)) * 100;
  // 10〜25%を理想帯とする
  const distance = pct < 10 ? 10 - pct : pct > 25 ? pct - 25 : 0;
  const score = Math.max(0, 100 - distance * 4);
  return {
    label: "現金比率",
    score,
    detail: `${pct.toFixed(1)}%`,
    status: statusOf(score),
  };
}

export function computeHealth(portfolio: Portfolio): PortfolioHealth {
  const total = portfolio.summary.totalValueJpy ?? 0;
  const factors: HealthFactor[] = [
    concentrationFactor(portfolio.positions, total),
    diversificationFactor(portfolio),
    breadthFactor(portfolio.positions),
  ];
  const cash = cashFactor(portfolio);
  if (cash) factors.push(cash);

  const score = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);
  const grade = score >= 80 ? "優" : score >= 65 ? "良好" : score >= 45 ? "要注意" : "要改善";

  return { score, grade, factors };
}

/* ─── AIコメント ─────────────────────────────────────── */

const COMMENT_PROMPT = `あなたは前川さん専属の投資アドバイザーAIです。
与えられたポートフォリオの「事実」だけをもとに、今日のコメントを書いてください。

## 厳守事項
- 与えられた数値以外の数字（株価・指数・PER・決算値など）を推測して書かない
- 相場の値動きを知っているかのように書かない（データが渡されていないため）
- 断定的な売買指示ではなく、判断材料と選択肢の提示にとどめる
- 前川さんは「面倒くさがりでも続けられる仕組み」を好むため、次の一手は1つに絞る

## 出力（JSONのみ。説明文やコードブロックは不要）
{
  "headline": "今日の要点（30文字以内）",
  "body": "本文（120文字以内・敬体）",
  "reasons": ["根拠（20文字以内）", "..."],
  "action": "次の一手（40文字以内）"
}`;

export type AiComment = {
  headline: string;
  body: string;
  reasons: string[];
  action: string;
};

export async function generateComment(
  portfolio: Portfolio,
  health: PortfolioHealth
): Promise<AiComment | null> {
  if (portfolio.positions.length === 0) return null;

  const holdingsText = portfolio.positions
    .map(
      (p) =>
        `- ${p.name}（${p.code}）: 評価額 ${p.marketValueJpy?.toLocaleString("ja-JP") ?? "不明"}円 / 損益率 ${
          p.pnlPct !== null ? `${p.pnlPct.toFixed(1)}%` : "不明"
        }${p.conviction ? ` / 確信度 ${p.conviction}` : ""}${p.thesis ? ` / 仮説: ${p.thesis}` : ""}`
    )
    .join("\n");

  const allocationText = portfolio.summary.allocation
    .map((a) => `${a.label} ${a.pct.toFixed(1)}%`)
    .join(" / ");

  const message = `【保有一覧】
${holdingsText}

【資産配分】${allocationText}
【総評価額】${portfolio.summary.totalValueJpy?.toLocaleString("ja-JP") ?? "不明"}円
【含み損益】${portfolio.summary.totalPnlJpy?.toLocaleString("ja-JP") ?? "不明"}円
【現金】${portfolio.summary.cashJpy?.toLocaleString("ja-JP") ?? "未設定"}
【健全性スコア】${health.score}点（${health.grade}）
${health.factors.map((f) => `- ${f.label}: ${f.detail}`).join("\n")}`;

  try {
    const response = await callAI(message, COMMENT_PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<AiComment>;
    if (!parsed.headline || !parsed.body) return null;

    return {
      headline: String(parsed.headline),
      body: String(parsed.body),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 4) : [],
      action: String(parsed.action ?? ""),
    };
  } catch (error) {
    console.error("[investing/analysis] AIコメントの生成に失敗:", error);
    return null;
  }
}

/* ─── 銘柄ごとのAI分析 ───────────────────────────────── */

const STOCK_PROMPT = `あなたは投資分析AIです。与えられた保有情報のみを根拠に、この銘柄の所感を書いてください。

## 厳守事項
- 渡されていない数値（売上・EPS・PER・アナリスト目標株価など）を創作しない
- 数値が無い項目は「データ未取得」と正直に書く
- 「買い推奨」等の断定はせず、保有継続/追加/縮小の判断材料を示す

## 出力（JSONのみ）
{
  "rating": 1〜5の整数（保有継続の妥当性。5=強く支持 1=見直し推奨）,
  "stance": "強気" | "中立" | "慎重",
  "summary": "総合所感（100文字以内・敬体）",
  "positives": ["良い点（25文字以内）"],
  "risks": ["リスク（25文字以内）"],
  "missingData": ["分析に足りないデータ（20文字以内）"]
}

ratingは渡された情報の範囲で判断し、データが乏しい場合は3にすること。`;

export type StockAnalysis = {
  /** 1〜5。保有継続の妥当性についてのAI評価 */
  rating: number;
  stance: string;
  summary: string;
  positives: string[];
  risks: string[];
  missingData: string[];
};

export async function analyzeStock(position: Position): Promise<StockAnalysis | null> {
  const message = `【銘柄】${position.name}（${position.code}）
【資産クラス】${position.assetClass}
【保有数】${position.quantity ?? "不明"}
【取得単価】${position.avgCost ?? "不明"}
【現在値】${position.currentPrice ?? "不明"}
【評価額】${position.marketValueJpy?.toLocaleString("ja-JP") ?? "不明"}円
【損益率】${position.pnlPct !== null ? `${position.pnlPct.toFixed(1)}%` : "不明"}
【投資仮説】${position.thesis ?? "未記録"}
【想定リスク】${position.risk ?? "未記録"}
【確信度】${position.conviction ?? "未記録"}`;

  try {
    const response = await callAI(message, STOCK_PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<StockAnalysis>;
    if (!parsed.summary) return null;

    const rating = Math.round(Number(parsed.rating));
    return {
      rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 3,
      stance: String(parsed.stance ?? "中立"),
      summary: String(parsed.summary),
      positives: Array.isArray(parsed.positives) ? parsed.positives.map(String).slice(0, 5) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 5) : [],
      missingData: Array.isArray(parsed.missingData)
        ? parsed.missingData.map(String).slice(0, 5)
        : [],
    };
  } catch (error) {
    console.error("[investing/analysis] 銘柄分析に失敗:", error);
    return null;
  }
}
