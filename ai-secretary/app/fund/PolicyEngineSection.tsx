"use client";

/**
 * /fund 投資判断エンジンUI（Phase 1.3）
 * docs/12_FUND_POLICY_ENGINE.md §17 画面要件
 * - サマリー警告（市場環境・データ鮮度・集中度）
 * - 銘柄評価フォーム（期間別スコア素点入力）
 * - 提案カード（スコア・RVOL/ADTV/スプレッド・購入不可理由・最大購入額）
 * - 本人判断の記録（確認・購入・見送り・売却。注文自動実行なし）
 * - 振り返り一覧
 */

import { useEffect, useState, useCallback } from "react";

type Horizon = "short" | "medium" | "long";

type Recommendation = {
  id: string;
  ticker: string;
  horizon: Horizon;
  decision: string;
  score: number;
  confidence: string;
  maxBuyJpy: number;
  maxShares: number;
  stagedBuyJpy: number[];
  invalidation: string | null;
  reasons: string[];
  counterarguments: string[];
  blockedBy: string[];
  warnings: string[];
  missingData: string[];
  dataAsOf: string;
  nextReviewAt: string;
  executionBlocked: boolean;
  assumedRoundTripCostPct: number | null;
  evaluatedAt: string;
  policyVersion: number;
};

type MarketInfo = {
  env: string;
  priceUsd: number | null;
  priceJpy: number | null;
  usdJpy: number | null;
  rvol20: number | null;
  adtv20Usd: number | null;
  spreadPct: number | null;
  changePct: number | null;
};

type Review = {
  decision: {
    id: string;
    ticker: string;
    action: string;
    note: string | null;
    amountJpy: number | null;
    decidedAt: string;
  };
  recommendation: Recommendation | null;
};

const jpy = (n: number | null | undefined) =>
  n == null ? "-" : `${n.toLocaleString("ja-JP")}円`;

const HORIZON_LABELS: Record<Horizon, string> = {
  short: "短期",
  medium: "中期",
  long: "長期",
};

/** §8 スコア素点の入力欄定義（期間別・配点は仕様の満点） */
const SCORE_FIELDS: Record<Horizon, { key: string; label: string; max: number }[]> = {
  short: [
    { key: "volume", label: "RVOL・出来高・売買代金", max: 20 },
    { key: "trend", label: "価格トレンド・支持抵抗", max: 20 },
    { key: "materials", label: "決算・ニュース等の材料", max: 20 },
    { key: "liquidity", label: "流動性・スプレッド", max: 15 },
    { key: "riskReward", label: "リスクリワード", max: 15 },
    { key: "env", label: "市場環境", max: 10 },
  ],
  medium: [
    { key: "fundamentals", label: "売上・利益・キャッシュフロー", max: 25 },
    { key: "guidance", label: "決算と会社予想の変化", max: 20 },
    { key: "industry", label: "業界成長・市場シェア", max: 15 },
    { key: "valuation", label: "バリュエーション", max: 15 },
    { key: "trend", label: "価格トレンド・需給", max: 10 },
    { key: "risk", label: "財務・外部リスク", max: 15 },
  ],
  long: [
    { key: "marketGrowth", label: "市場の長期成長性", max: 20 },
    { key: "moat", label: "競争優位・参入障壁", max: 20 },
    { key: "growth", label: "売上・利益・FCF成長", max: 20 },
    { key: "financial", label: "財務健全性", max: 15 },
    { key: "management", label: "経営・資本配分", max: 10 },
    { key: "valuation", label: "バリュエーション", max: 10 },
    { key: "invalidation", label: "仮説崩壊条件の明確さ", max: 5 },
  ],
};

const VOLUME_KEYS = ["volume"];

const DECISION_STYLES: Record<string, string> = {
  BUY_CANDIDATE: "bg-emerald-900/60 text-emerald-300",
  ADD_CANDIDATE: "bg-emerald-900/60 text-emerald-300",
  WAIT: "bg-slate-700 text-slate-300",
  WAIT_DATA: "bg-amber-900/60 text-amber-300",
  HOLD: "bg-blue-900/60 text-blue-300",
  TRIM_CANDIDATE: "bg-orange-900/60 text-orange-300",
  EXIT_CANDIDATE: "bg-rose-900/60 text-rose-300",
};

/** blockedBy コードの日本語表示（§17 購入不可理由） */
const BLOCK_LABELS: Record<string, string> = {
  no_investable_amount: "投資可能額が未設定",
  investable_amount_zero_or_negative: "投資可能額が0円以下",
  capacity_stale_over_24h: "投資可能額データが24時間超経過",
  capacity_freshness_unknown: "投資可能額の更新日時が不明",
  capacity_confidence_low: "家計データの信頼度が低い",
  capacity_missing_data: "家計データに不足項目",
  price_unavailable: "株価データなし",
  price_stale: "株価データが古い",
  single_stock_limit: "1銘柄上限（個別株内40%）超過",
  theme_limit: "テーマ上限（個別株内70%）超過",
  adtv_below_minimum: "売買代金が最低基準未満",
  adtv_unknown_short: "売買代金不明（短期）",
  spread_unknown_short: "スプレッド不明（短期は購入不可）",
  spread_unknown: "スプレッド不明（実資金購入不可・仮想提案のみ）",
  spread_too_wide: "スプレッドが上限超過",
  overheated: "過熱状態（追いかけ買い禁止）",
  earnings_blackout: "決算直前ブラックアウト",
  no_exit_price_short: "撤退価格が未入力（短期は必須）",
  rvol_only_signal: "RVOL単独シグナル（購入根拠不十分）",
};

export default function PolicyEngineSection() {
  const [envInfo, setEnvInfo] = useState<{ env: string; usdJpy: number | null; asOf: string | null } | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [policyVersion, setPolicyVersion] = useState<number | null>(null);

  // 評価フォーム
  const [ticker, setTicker] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [exitPrice, setExitPrice] = useState<string>("");
  const [invalidation, setInvalidation] = useState("");
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [lastMarket, setLastMarket] = useState<MarketInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [envRes, recRes, revRes, polRes] = await Promise.all([
        fetch("/api/fund/evaluate"),
        fetch("/api/fund/recommendations"),
        fetch("/api/fund/reviews"),
        fetch("/api/fund/policy"),
      ]);
      if (envRes.ok) {
        const j = await envRes.json();
        setEnvInfo({ env: j.env, usdJpy: j.usdJpy, asOf: j.asOf });
      }
      if (recRes.ok) setRecs((await recRes.json()).recommendations ?? []);
      if (revRes.ok) setReviews((await revRes.json()).reviews ?? []);
      if (polRes.ok) setPolicyVersion((await polRes.json()).policy?.policyVersion ?? null);
    } catch {
      // サマリーの一部欠落は致命的でない
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const submitEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/fund/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim(),
          horizon,
          scores,
          volumeScoreKeys: VOLUME_KEYS,
          exitPriceJpy: exitPrice ? Number(exitPrice) : null,
          thesis: {
            invalidation: invalidation || null,
            hypothesisMaintained: true,
            hasNewCatalyst: false,
          },
          reasons: reason ? [reason] : [],
          counterarguments: counter ? [counter] : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "評価に失敗しました");
      setLastMarket(json.market);
      setNotice(`評価完了: ${json.recommendation.ticker} → ${json.recommendation.decision}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "評価に失敗しました");
    } finally {
      setEvaluating(false);
    }
  };

  const recordDecision = async (rec: Recommendation, action: string) => {
    setError(null);
    try {
      const res = await fetch("/api/fund/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: rec.id,
          ticker: rec.ticker,
          action,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "記録に失敗しました");
      setNotice(`記録しました: ${rec.ticker} — ${action}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "記録に失敗しました");
    }
  };

  const fields = SCORE_FIELDS[horizon];
  const totalInput = fields.reduce((s, f) => s + (scores[f.key] ?? 0), 0);

  return (
    <>
      {/* 市場環境サマリー */}
      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-2">市場環境・エンジン状態</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <span
            className={`px-2 py-1 rounded-full font-semibold ${
              envInfo?.env === "RISK_ON"
                ? "bg-emerald-900/60 text-emerald-300"
                : envInfo?.env === "RISK_OFF"
                  ? "bg-rose-900/60 text-rose-300"
                  : "bg-slate-700 text-slate-300"
            }`}
          >
            {envInfo?.env ?? "取得中..."}
          </span>
          <span className="text-slate-400">
            USD/JPY: {envInfo?.usdJpy ?? "-"}（{envInfo?.asOf ?? "-"}）
          </span>
          <span className="text-slate-400">policyVersion: {policyVersion ?? "-"}</span>
          <span className="text-amber-300">短期はpaper mode（検証中・実資金移行前）</span>
        </div>
      </section>

      {/* 銘柄評価フォーム */}
      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-2">銘柄評価（{HORIZON_LABELS[horizon]}スコア）</h2>
        <p className="text-xs text-slate-400 mb-3">
          スコア素点はAI（Fund Manager）または本人が入力する。合算・ゲート判定・購入上限は
          サーバー側の決定論的エンジンが計算し、プロンプトでは決定しない。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="ティッカー（例: NVDA）"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm w-40"
          />
          <select
            value={horizon}
            onChange={(e) => {
              setHorizon(e.target.value as Horizon);
              setScores({});
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
          >
            {(["short", "medium", "long"] as Horizon[]).map((h) => (
              <option key={h} value={h}>
                {HORIZON_LABELS[h]}
              </option>
            ))}
          </select>
          <input
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            placeholder="撤退価格（円）短期は必須"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm w-48"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {fields.map((f) => (
            <label key={f.key} className="text-xs text-slate-400">
              {f.label}（/{f.max}）
              <input
                type="number"
                min={0}
                max={f.max}
                value={scores[f.key] ?? ""}
                onChange={(e) =>
                  setScores((prev) => ({
                    ...prev,
                    [f.key]: Math.min(f.max, Math.max(0, Number(e.target.value))),
                  }))
                }
                className="mt-0.5 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-100"
              />
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="根拠（1行）"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs"
          />
          <input
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            placeholder="反対材料（1行）"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs"
          />
          <input
            value={invalidation}
            onChange={(e) => setInvalidation(e.target.value)}
            placeholder="仮説崩壊条件"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={submitEvaluate}
            disabled={evaluating || !ticker.trim()}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 text-sm font-semibold"
          >
            {evaluating ? "評価中..." : "エンジンで評価"}
          </button>
          <span className="text-xs text-slate-400">素点合計: {totalInput}/100</span>
        </div>
        {notice && <p className="text-xs text-emerald-400 mt-2">{notice}</p>}
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
        {lastMarket && (
          <p className="text-[11px] text-slate-500 mt-2">
            市場データ: {lastMarket.priceUsd ?? "-"}USD / {jpy(lastMarket.priceJpy)}・RVOL20{" "}
            {lastMarket.rvol20 ?? "-"}・ADTV20{" "}
            {lastMarket.adtv20Usd ? `$${Math.round(lastMarket.adtv20Usd / 1e6)}M` : "-"}・スプレッド{" "}
            {lastMarket.spreadPct ?? "不明"}
          </p>
        )}
      </section>

      {/* 提案カード */}
      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-3">AI提案（新しい順）</h2>
        {recs.length === 0 ? (
          <p className="text-xs text-slate-400">まだ提案がありません。上のフォームで評価してください。</p>
        ) : (
          <div className="space-y-3">
            {recs.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-bold">{r.ticker}</span>
                  <span className="text-xs text-slate-400">{HORIZON_LABELS[r.horizon]}</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DECISION_STYLES[r.decision] ?? "bg-slate-700"}`}
                  >
                    {r.decision}
                  </span>
                  <span className="text-xs text-slate-400">スコア {r.score}/100</span>
                  {r.executionBlocked && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300">
                      仮想提案（実資金購入不可）
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {new Date(r.evaluatedAt).toLocaleString("ja-JP")}・v{r.policyVersion}
                  </span>
                </div>
                {r.assumedRoundTripCostPct != null && (
                  <p className="text-[10px] text-slate-500 mb-1">
                    paper mode: 仮想売買の想定往復コスト {r.assumedRoundTripCostPct}%
                  </p>
                )}
                <p className="text-xs text-slate-300 mb-1">
                  最大購入額 <span className="font-semibold">{jpy(r.maxBuyJpy)}</span>／最大{" "}
                  <span className="font-semibold">{r.maxShares}株</span>
                  {r.maxBuyJpy > 0 && r.stagedBuyJpy?.length === 3 && (
                    <span className="text-slate-500">
                      （段階: {jpy(r.stagedBuyJpy[0])} → {jpy(r.stagedBuyJpy[1])} → {jpy(r.stagedBuyJpy[2])}）
                    </span>
                  )}
                </p>
                {r.blockedBy.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {r.blockedBy.map((b) => (
                      <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300">
                        {BLOCK_LABELS[b] ?? b}
                      </span>
                    ))}
                  </div>
                )}
                {r.warnings.length > 0 && (
                  <p className="text-[10px] text-amber-300/80 mb-1">⚠ {r.warnings.join(" / ")}</p>
                )}
                {r.reasons.length > 0 && (
                  <p className="text-[11px] text-slate-400">根拠: {r.reasons.join("・")}</p>
                )}
                {r.counterarguments.length > 0 && (
                  <p className="text-[11px] text-slate-400">反対材料: {r.counterarguments.join("・")}</p>
                )}
                {r.invalidation && (
                  <p className="text-[11px] text-slate-500">仮説崩壊条件: {r.invalidation}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    ["acknowledged", "確認した"],
                    ["bought", "購入した"],
                    ["skipped", "見送った"],
                    ["trimmed", "一部売却した"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      onClick={() => recordDecision(r, action)}
                      className="text-[11px] rounded-lg border border-slate-700 hover:bg-slate-800 px-2 py-1"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-3">
          指値は価格を制御できる一方、約定を保証しない。成行注文は推奨しない。注文は必ず本人が証券会社の画面で行う。
        </p>
      </section>

      {/* 振り返り */}
      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-3">本人判断の記録（振り返り）</h2>
        {reviews.length === 0 ? (
          <p className="text-xs text-slate-400">まだ記録がありません。</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left py-1.5">日時</th>
                <th className="text-left py-1.5">銘柄</th>
                <th className="text-left py-1.5">判断</th>
                <th className="text-left py-1.5">AI提案</th>
              </tr>
            </thead>
            <tbody>
              {reviews.slice(0, 15).map((rv) => (
                <tr key={rv.decision.id} className="border-b border-slate-800/60">
                  <td className="py-1.5 text-slate-400">
                    {new Date(rv.decision.decidedAt).toLocaleString("ja-JP")}
                  </td>
                  <td className="py-1.5">{rv.decision.ticker}</td>
                  <td className="py-1.5">{rv.decision.action}</td>
                  <td className="py-1.5 text-slate-400">
                    {rv.recommendation
                      ? `${rv.recommendation.decision}（${rv.recommendation.score}点）`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
