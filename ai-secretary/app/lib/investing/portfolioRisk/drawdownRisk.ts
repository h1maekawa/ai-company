import type { ValuePoint } from "../types";
import { round2 } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

const WINDOW_DAYS = 60;

function levelFor(drawdownPct: number): "LOW" | "MEDIUM" | "HIGH" {
  const cfg = PORTFOLIO_RISK_THRESHOLDS.drawdownRisk;
  if (drawdownPct > cfg.highPct) return "HIGH";
  if (drawdownPct > cfg.mediumPct) return "MEDIUM";
  return "LOW";
}

/**
 * Portfolio-level max drawdown over the trailing 60 days available in the existing
 * value-history (app/lib/investing/history.ts). Reuses the real, recorded total-value series;
 * never a per-position estimate. Fewer than 2 points in the window stays DATA_INCOMPLETE.
 */
export function buildDrawdownRisk(points: ValuePoint[], now = new Date()): PortfolioRiskAssessment {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const windowed = [...points].filter((point) => point.date >= cutoffKey).sort((a, b) => (a.at ?? `${a.date}T23:59:59.999Z`).localeCompare(b.at ?? `${b.date}T23:59:59.999Z`));

  if (windowed.length < 2) {
    return { key: "drawdownRisk", level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: `直近${WINDOW_DAYS}日の資産推移が2点未満です`, evidenceRefs: [], affectedTickers: [] };
  }

  let peak = windowed[0].totalValueJpy;
  let maxDrawdownPct = 0;
  for (const point of windowed) {
    if (point.totalValueJpy > peak) peak = point.totalValueJpy;
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - point.totalValueJpy) / peak) * 100);
  }
  const pct = round2(maxDrawdownPct);

  return {
    key: "drawdownRisk",
    level: levelFor(pct),
    score: pct,
    coverage: 1,
    reason: `直近${WINDOW_DAYS}日の最大drawdown ${pct}%`,
    evidenceRefs: [],
    affectedTickers: [],
  };
}
