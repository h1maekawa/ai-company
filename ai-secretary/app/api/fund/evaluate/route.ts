import { NextRequest, NextResponse } from "next/server";
import {
  loadPolicy,
  loadCapacity,
  loadHoldings,
  appendRecommendation,
} from "@/app/lib/fund/store";
import { themeOfTicker, Horizon } from "@/app/lib/fund/policy";
import {
  evaluate,
  EvaluationInput,
  ScoreComponents,
} from "@/app/lib/fund/engine";
import { getMarketSnapshot } from "@/app/lib/fund/marketData/snapshot";

interface EvaluateRequest {
  ticker: string;
  horizon: Horizon;
  /** スコア素点（AI/人間提示）。合算・判定はサーバー側エンジンが行う */
  scores?: ScoreComponents;
  volumeScoreKeys?: string[];
  exitPriceJpy?: number | null;
  daysToEarnings?: number | null;
  drawdownFromCostPct?: number | null;
  thesis?: {
    summary?: string | null;
    invalidation?: string | null;
    hasNewCatalyst?: boolean;
    hypothesisMaintained?: boolean;
  };
  reasons?: string[];
  counterarguments?: string[];
}

const HORIZONS: Horizon[] = ["short", "medium", "long"];

/**
 * GET /api/fund/evaluate — 市場環境スナップショット（SPY基準）のみ返す。
 * /fund サマリー表示用。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const market = await getMarketSnapshot("SPY");
    return NextResponse.json({
      success: true,
      env: market.env,
      usdJpy: market.usdJpy,
      asOf: market.priceAsOf,
      provider: market.provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/fund/evaluate
 * 銘柄×期間を評価し、FundRecommendation を返して提案ログへ保存する。
 * 金額・株数の計算はAIプロンプトではなく決定論的エンジン（engine.ts）が行う（§19）。
 * 証券注文は一切実行しない。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as EvaluateRequest;

    if (!body.ticker || typeof body.ticker !== "string") {
      return NextResponse.json({ error: "ticker は必須です" }, { status: 400 });
    }
    if (!HORIZONS.includes(body.horizon)) {
      return NextResponse.json(
        { error: "horizon は short | medium | long のいずれかです" },
        { status: 400 }
      );
    }

    const ticker = body.ticker.toUpperCase();

    const [{ policy }, capacity, holdings] = await Promise.all([
      loadPolicy(),
      loadCapacity(),
      loadHoldings(),
    ]);
    const market = await getMarketSnapshot(ticker);

    // 保有状況の決定論的集計
    const stockValueJpy = holdings?.summary.stockValueJpy ?? 0;
    const fundValueJpy = holdings?.summary.fundValueJpy ?? 0;
    const totalJpy = holdings?.summary.totalMarketValueJpy ?? 0;

    const tickerHolding = holdings?.holdings.find(
      (h) => h.code.toUpperCase() === ticker
    );
    const tickerValueJpy = tickerHolding?.marketValueJpy ?? 0;

    const theme = themeOfTicker(policy, ticker);
    const themeTickers = theme ? policy.themes[theme] : [];
    const themeValueJpy = theme
      ? (holdings?.holdings ?? [])
          .filter((h) => themeTickers.includes(h.code.toUpperCase()))
          .reduce((s, h) => s + (h.marketValueJpy ?? 0), 0)
      : 0;

    const input: EvaluationInput = {
      ticker,
      horizon: body.horizon,
      capacity: {
        investableJpy: capacity?.investable_amount ?? null,
        calculatedAt: capacity?.calculated_at ?? null,
        confidence: capacity?.confidence ?? (capacity ? "medium" : null),
        missingData: capacity?.missing_data ?? [],
      },
      portfolio: {
        totalInvestmentAssetsJpy: totalJpy,
        stockValueJpy,
        fundValueJpy,
        tickerValueJpy,
        themeValueJpy,
        isHeld: tickerValueJpy > 0,
      },
      market: {
        env: market.env,
        priceJpy: market.priceJpy,
        priceAsOf: market.priceAsOf,
        rvol20: market.rvol20,
        adtv20Usd: market.adtv20Usd,
        spreadPct: market.spreadPct,
        atr14: market.atr14,
        changePct: market.changePct,
        daysToEarnings: body.daysToEarnings ?? market.daysToEarnings,
      },
      scores: body.scores ?? {},
      volumeScoreKeys: body.volumeScoreKeys ?? ["volume", "rvol"],
      thesis: {
        summary: body.thesis?.summary ?? null,
        invalidation: body.thesis?.invalidation ?? null,
        hasNewCatalyst: body.thesis?.hasNewCatalyst ?? false,
        hypothesisMaintained: body.thesis?.hypothesisMaintained ?? true,
      },
      exit: { exitPriceJpy: body.exitPriceJpy ?? null },
      drawdownFromCostPct: body.drawdownFromCostPct ?? null,
      reasons: body.reasons ?? [],
      counterarguments: body.counterarguments ?? [],
    };

    const recommendation = evaluate(input, policy);

    // §16 短期はpaper mode中であることを明示
    if (body.horizon === "short" && policy.paperMode.enabled) {
      recommendation.warnings = [...recommendation.warnings, "paper_mode_active"];
    }

    const stored = await appendRecommendation(recommendation);

    return NextResponse.json({
      success: true,
      recommendation: stored,
      market: {
        provider: market.provider,
        env: market.env,
        priceUsd: market.priceUsd,
        priceJpy: market.priceJpy,
        usdJpy: market.usdJpy,
        priceAsOf: market.priceAsOf,
        rvol20: market.rvol20,
        adtv20Usd: market.adtv20Usd,
        spreadPct: market.spreadPct,
        atr14: market.atr14,
        changePct: market.changePct,
        missingData: market.missingData,
      },
      policyVersion: policy.policyVersion,
    });
  } catch (error) {
    // §19: リクエスト内容・保有情報はログへ出さない
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Evaluate API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
