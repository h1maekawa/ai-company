"use client";

import { Search, Sparkles, TriangleAlert } from "lucide-react";
import { genreLabel } from "@/app/lib/note/research/sources/note";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useCandidates } from "@/app/note/useResearch";

/**
 * リサーチ候補。
 * 「なぜ伸びていると判断したか」と「使える本人の体験」を必ず見せて、
 * 人が納得したうえで作成に進めるようにする。
 */
export function ResearchPanel() {
  const state = useCandidates();
  const visible = state.clusters.filter((c) => c.status === "candidate" || c.status === "selected");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="リサーチ候補"
          hint="X・noteの公開情報から、まえみちと相性の良いテーマを採点して並べます"
          action={
            <button
              onClick={state.runResearch}
              disabled={state.running}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85 disabled:opacity-40"
            >
              <Search className="h-3.5 w-3.5" />
              {state.running ? "調べています…" : "リサーチを実行"}
            </button>
          }
        />
        {state.notice && <p className="text-xs text-gain">{state.notice}</p>}
        {state.error && <p className="text-xs text-loss">{state.error}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-sub">
          他者の文章はそのまま保存せず、フック・構成・CTAの「型」だけを取り出しています。
          生成物は投稿前に必ずコピー判定を通します。
        </p>
      </Card>

      {state.loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title="候補がまだありません"
            description="「リサーチを実行」を押すと、登録した参考アカウントとタグから候補を探します。"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-gain/15 px-2 py-0.5 text-xs font-bold text-gain tabular-nums">
                      {c.totalScore}点
                    </span>
                    <p className="min-w-0 truncate text-sm font-semibold text-white">{c.title}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-sub">{c.summary}</p>
                </div>
                <span className="text-[10px] text-sub">
                  {c.genreIds.map(genreLabel).join("、") || "ジャンル未判定"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] text-sub sm:grid-cols-5">
                <Score label="話題性" value={c.trendScore} max={25} />
                <Score label="まえみち適合" value={c.brandFitScore} max={25} />
                <Score label="体験一致" value={c.experienceFitScore} max={20} />
                <Score label="収益導線" value={c.monetizationFitScore} max={15} />
                <Score label="オリジナル化" value={c.originalityScore} max={15} />
              </div>

              <div className="mt-3">
                <p className="text-[10px] text-sub">使える本人の体験</p>
                {c.experiences.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {c.experiences.map((e) => (
                      <li key={e.id} className="text-[11px] text-slate-300">
                        {e.verifiedByUser ? "✅" : "⏳"} {e.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-amber-300">
                    このテーマに使える登録済みの体験がありません（体験談としては書けません）
                  </p>
                )}
              </div>

              {c.items.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] text-sub">参考にしたソース</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.items.slice(0, 3).map((i) => (
                      <li key={i.id}>
                        <a
                          href={i.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-brand hover:underline"
                        >
                          [{i.platform}] {(i.title ?? i.sourceUrl).slice(0, 48)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(c.blocked || c.penalties.length > 0) && (
                <div className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  {c.blocked && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      {c.blockReason}
                    </p>
                  )}
                  {c.penalties.map((p, i) => (
                    <p key={i} className="text-[11px] text-amber-300/90">
                      ・{p}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {!c.blocked && (
                  <>
                    <button
                      onClick={() => state.generate(c.id, "x")}
                      disabled={state.running}
                      className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand/85 disabled:opacity-40"
                    >
                      X投稿を作る
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "note", "free")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      無料note
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "note", "paid")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      有料note
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "both")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      両方
                    </button>
                  </>
                )}
                <button
                  onClick={() => state.setStatus(c.id, "rejected")}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-sub hover:text-loss"
                >
                  見送る
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Score({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-1.5">
      <p className="truncate">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-200 tabular-nums">
        {value}
        <span className="text-sub">/{max}</span>
      </p>
    </div>
  );
}

/** ダッシュボードの「今日の候補」ミニ表示 */
export function ResearchSummaryCard({ onOpen }: { onOpen: () => void }) {
  const { clusters, loading } = useCandidates();
  const candidates = clusters.filter((c) => c.status === "candidate" && !c.blocked);
  const top = candidates[0];

  return (
    <button
      onClick={onOpen}
      className="rounded-2xl border border-hairline bg-ink-card p-4 text-left transition-colors hover:border-brand/40"
    >
      <p className="text-sm font-semibold text-white">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
        リサーチ候補 {loading ? "…" : `${candidates.length}件`}
      </p>
      <p className="mt-1 text-[11px] text-sub">
        {top ? `最有力: ${top.title.slice(0, 32)}（${top.totalScore}点）` : "リサーチを実行すると候補が出ます"}
      </p>
    </button>
  );
}
