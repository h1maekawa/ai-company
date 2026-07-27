"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";
import { InvestingShell } from "@/components/investing/Shell";
import { NewsPanel } from "@/components/investing/NewsPanel";
import { Badge, Card, CardHeader, EmptyState, Skeleton, toneOf } from "@/components/investing/ui";
import type { StockAnalysis } from "@/app/lib/investing/analysis";
import { Position, formatJpy, formatPct } from "@/app/lib/investing/types";
import { useNews } from "../../usePortfolio";

const TABS = ["概要", "チャート", "ニュース", "財務", "AI分析"] as const;
type Tab = (typeof TABS)[number];

export default function StockDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? "").toUpperCase();

  const [tab, setTab] = useState<Tab>("概要");
  const [position, setPosition] = useState<Position | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const news = useNews();
  const relatedNews = news.items.filter((item) =>
    item.tickers.some((t) => t.toUpperCase() === code)
  );

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`/api/investing/analysis?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((json: { position?: Position; analysis?: StockAnalysis; error?: string }) => {
        if (json.position) {
          setPosition(json.position);
          setAnalysis(json.analysis ?? null);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  if (notFound) {
    return (
      <InvestingShell title={code}>
        <Card>
          <EmptyState
            title={`${code} は保有一覧にありません`}
            description="保有していない銘柄の株価・財務データを取得する外部連携はまだ実装されていません。保有銘柄のみ詳細を表示できます。"
            action={
              <Link
                href="/investing/holdings"
                className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/85"
              >
                保有株一覧へ
              </Link>
            }
          />
        </Card>
      </InvestingShell>
    );
  }

  return (
    <InvestingShell title={position?.name ?? code}>
      <Link
        href="/investing/holdings"
        className="mb-4 inline-flex items-center gap-1 text-xs text-sub hover:text-white"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        保有株一覧
      </Link>

      {/* ─── ヘッダー ───────────────────────────── */}
      {loading ? (
        <Skeleton className="mb-5 h-[120px] rounded-2xl" />
      ) : position ? (
        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-white">{position.name}</h2>
                <Badge>{position.code}</Badge>
                {position.conviction && <Badge tone="brand">確信度 {position.conviction}</Badge>}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
                {position.currentPrice !== null
                  ? position.currency === "USD"
                    ? `$${position.currentPrice.toLocaleString("en-US")}`
                    : `¥${position.currentPrice.toLocaleString("ja-JP")}`
                  : "—"}
              </p>
              <p className={`mt-0.5 text-sm font-medium ${toneOf(position.pnlPct)}`}>
                {formatPct(position.pnlPct, { sign: true })}
                <span className="ml-1 text-xs text-sub">（取得来）</span>
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-sub">保有数</dt>
                <dd className="mt-0.5 tabular-nums text-white">
                  {position.quantity?.toLocaleString("ja-JP") ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sub">取得単価</dt>
                <dd className="mt-0.5 tabular-nums text-white">
                  {position.avgCost !== null ? position.avgCost.toLocaleString("ja-JP") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sub">評価額</dt>
                <dd className="mt-0.5 tabular-nums text-white">
                  {formatJpy(position.marketValueJpy)}
                </dd>
              </div>
              <div>
                <dt className="text-sub">含み益</dt>
                <dd className={`mt-0.5 tabular-nums ${toneOf(position.pnlJpy)}`}>
                  {formatJpy(position.pnlJpy, { sign: true })}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      ) : null}

      {/* ─── タブ ─────────────────────────────── */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-ink-card p-1">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === item ? "bg-brand text-white" : "text-sub hover:text-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "概要" && position && (
        <Card>
          <CardHeader title="投資仮説" hint="positions.md に記録した内容" />
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs text-sub">仮説（なぜ持っているか）</dt>
              <dd className="mt-1 leading-relaxed text-slate-200">
                {position.thesis || "未記録"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-sub">想定リスク</dt>
              <dd className="mt-1 leading-relaxed text-slate-200">{position.risk || "未記録"}</dd>
            </div>
          </dl>
        </Card>
      )}

      {tab === "チャート" && (
        <Card>
          <CardHeader title="価格チャート" />
          <EmptyState
            title="株価の時系列データが未連携です"
            description="個別銘柄の価格履歴を取得する市場データ連携がまだ有効になっていません。実データが無いため、ここではチャートを描画しません。"
          />
        </Card>
      )}

      {tab === "ニュース" && (
        <NewsPanel items={relatedNews} available={news.available} loading={news.loading} />
      )}

      {tab === "財務" && (
        <Card>
          <CardHeader title="財務データ" />
          <EmptyState
            title="財務データが未連携です"
            description="売上・EPS・営業利益・ROEなどは外部データソースが必要です。推測値を表示しない方針のため、連携するまで空欄にしています。"
          />
        </Card>
      )}

      {tab === "AI分析" && (
        <Card>
          <CardHeader
            title="AI分析"
            action={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Sparkles className="h-4 w-4" />
              </span>
            }
          />
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : !analysis ? (
            <EmptyState title="分析を生成できませんでした" />
          ) : (
            <div className="space-y-4">
              {/* AI総合評価 */}
              <div className="rounded-xl border border-hairline bg-white/[0.02] p-4 text-center">
                <p className="text-[11px] text-sub">AI総合評価</p>
                <p className="mt-1 text-2xl tracking-[0.2em]" aria-label={`5段階中${analysis.rating}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={n <= analysis.rating ? "text-amber-400" : "text-white/15"}>
                      ★
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 flex items-center justify-center gap-2">
                  <Badge
                    tone={
                      analysis.stance === "強気"
                        ? "gain"
                        : analysis.stance === "慎重"
                          ? "loss"
                          : "neutral"
                    }
                  >
                    {analysis.stance}
                  </Badge>
                  <span className="text-[11px] text-sub">保有継続の妥当性</span>
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-200">{analysis.summary}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gain">評価できる点</p>
                  <ul className="space-y-1">
                    {analysis.positives.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        ・{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-loss">リスク</p>
                  <ul className="space-y-1">
                    {analysis.risks.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        ・{item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {analysis.missingData.length > 0 && (
                <div className="rounded-xl border border-hairline bg-white/[0.03] p-3">
                  <p className="text-[11px] font-semibold text-sub">
                    より正確な分析に足りないデータ
                  </p>
                  <p className="mt-1 text-[11px] text-sub">
                    {analysis.missingData.join(" / ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </InvestingShell>
  );
}
