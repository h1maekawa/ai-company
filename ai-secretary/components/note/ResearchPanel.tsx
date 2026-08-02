"use client";

import { Search, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { genreLabel } from "@/app/lib/note/research/sources/note";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useCandidates } from "@/app/note/useResearch";

type ResultView = "recommended" | "review" | "excluded";
const INITIAL_RESULT_COUNT = 8;

/**
 * リサーチ候補。
 * 「なぜ伸びていると判断したか」と「使える本人の体験」を必ず見せて、
 * 人が納得したうえで作成に進めるようにする。
 */
export function ResearchPanel() {
  const state = useCandidates();
  const [view, setView] = useState<ResultView>("recommended");
  const [resultCount, setResultCount] = useState(INITIAL_RESULT_COUNT);
  const resultGroups = useMemo(() => {
    const candidates = state.clusters.filter(
      (c) => c.status === "candidate" || c.status === "selected"
    );
    return {
      recommended: candidates.filter(
        (c) => !c.blocked && c.brandFitScore >= 7 && c.totalScore >= 25
      ),
      review: candidates.filter(
        (c) => !c.blocked && (c.brandFitScore < 7 || c.totalScore < 25)
      ),
      excluded: candidates.filter((c) => c.blocked),
    };
  }, [state.clusters]);
  const selectedResults = resultGroups[view];
  const visible = selectedResults.slice(0, resultCount);

  function changeView(next: ResultView) {
    setView(next);
    setResultCount(INITIAL_RESULT_COUNT);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="投稿する話題を探す"
          hint="読まれそうな話題と、まえみちらしく書ける話題を見つけます"
          action={
            <button
              onClick={state.runResearch}
              disabled={state.running}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85 disabled:opacity-40"
            >
              <Search className="h-3.5 w-3.5" />
              {state.running ? "話題を探しています…" : "新しい話題を探す"}
            </button>
          }
        />
        {state.notice && <p className="text-xs text-gain">{state.notice}</p>}
        {state.error && <p className="text-xs text-loss">{state.error}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <SimpleStep number="1" title="話題を探す" text="上のボタンを1回押します" />
          <SimpleStep number="2" title="候補を選ぶ" text="点数と自分の体験を確認します" />
          <SimpleStep number="3" title="文章を作る" text="Xまたはnoteのボタンを押します" />
        </div>
        <details className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-sub">
          <summary className="cursor-pointer font-medium text-slate-300">リサーチとは？ 点数はどう見る？</summary>
          <div className="mt-2 space-y-1 leading-relaxed">
            <p>話題性＝いま注目されているか、まえみち適合＝発信テーマに合うか、体験一致＝前川さん本人の経験を使えるか、を示します。</p>
            <p>点数が高くても「体験一致」が低い候補は、体験談として書かず、解説や感想として扱います。</p>
            <p>他者の文章はコピーせず、読まれている理由や構成だけを参考にします。</p>
          </div>
        </details>
      </Card>

      {!state.loading && state.clusters.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="リサーチ結果の絞り込み">
          <ResultTab
            active={view === "recommended"}
            label="おすすめ"
            count={resultGroups.recommended.length}
            onClick={() => changeView("recommended")}
          />
          <ResultTab
            active={view === "review"}
            label="要確認"
            count={resultGroups.review.length}
            onClick={() => changeView("review")}
          />
          <ResultTab
            active={view === "excluded"}
            label="対象外"
            count={resultGroups.excluded.length}
            onClick={() => changeView("excluded")}
          />
        </div>
      )}

      {state.loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title={state.clusters.length === 0 ? "候補がまだありません" : "この分類には候補がありません"}
            description={
              state.clusters.length === 0
                ? "上の「新しい話題を探す」を押してください。見つかったテーマがここに並びます。"
                : "別の分類を選ぶか、新しい話題を探してください。"
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="px-1 text-[11px] leading-relaxed text-sub">
            {view === "recommended" &&
              "まえみちの発信テーマに合い、一定の根拠がある候補です。気になるものだけ文章にできます。"}
            {view === "review" &&
              "発信テーマとの一致や根拠が弱い候補です。使う前に内容を確認してください。"}
            {view === "excluded" &&
              "競艇など、まえみちの発信対象ではない話題です。文章作成や公開には使われません。"}
          </p>
          {visible.map((c) => (
            <Card key={c.id} className={c.blocked ? "opacity-70" : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                        c.blocked ? "bg-amber-500/15 text-amber-300" : "bg-gain/15 text-gain"
                      }`}
                    >
                      {c.blocked ? "対象外" : `${c.totalScore}点`}
                    </span>
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug text-white">
                      {c.title}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-sub">{c.summary}</p>
                </div>
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-sub">
                  {c.genreIds.map(genreLabel).join("、") || "ジャンル未判定"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className={c.brandFitScore >= 7 ? "text-gain" : "text-amber-300"}>
                  {c.brandFitScore >= 7 ? "✓ 発信テーマに合う" : "△ 発信テーマとの一致が弱い"}
                </span>
                <span className={c.experiences.length > 0 ? "text-gain" : "text-sub"}>
                  {c.experiences.length > 0 ? "✓ 本人の体験あり" : "体験なし（解説向け）"}
                </span>
              </div>

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

              <details className="mt-3 rounded-lg border border-hairline bg-white/[0.02] px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-slate-300">
                  判断の内訳・参考元を見る
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] text-sub sm:grid-cols-5">
                  <Score label="話題性" value={c.trendScore} max={25} />
                  <Score label="まえみち適合" value={c.brandFitScore} max={25} />
                  <Score label="体験一致" value={c.experienceFitScore} max={20} />
                  <Score label="収益導線" value={c.monetizationFitScore} max={15} />
                  <Score label="オリジナル化" value={c.originalityScore} max={15} />
                </div>
                {c.experiences.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] text-sub">使える本人の体験</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.experiences.map((e) => (
                        <li key={e.id} className="text-[11px] text-slate-300">
                          {e.verifiedByUser ? "✅" : "⏳"} {e.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.items.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] text-sub">参考にしたソース</p>
                    <ul className="mt-1 space-y-1">
                      {c.items.slice(0, 3).map((i) => (
                        <li key={i.id}>
                          <a
                            href={i.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words text-[11px] text-brand hover:underline"
                          >
                            [{i.platform}] {(i.title ?? i.sourceUrl).slice(0, 72)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </details>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {!c.blocked && (
                  <>
                    <button
                      onClick={() => state.generate(c.id, "x")}
                      disabled={state.running}
                      className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand/85 disabled:opacity-40"
                    >
                      X用の短い文章を作る
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "note", "free")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      無料note記事を作る
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "note", "paid")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      有料noteの構成を作る
                    </button>
                    <button
                      onClick={() => state.generate(c.id, "both")}
                      disabled={state.running}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      Xとnoteを両方作る
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
          {selectedResults.length > visible.length && (
            <button
              onClick={() => setResultCount((count) => count + INITIAL_RESULT_COUNT)}
              className="w-full rounded-xl border border-hairline py-2.5 text-xs font-medium text-slate-300 hover:bg-white/5"
            >
              続きを表示（残り{selectedResults.length - visible.length}件）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResultTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-brand text-white"
          : "border border-hairline bg-ink-card text-sub hover:text-white"
      }`}
    >
      {label} {count}
    </button>
  );
}

function SimpleStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-hairline bg-white/[0.02] p-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
        {number}
      </span>
      <div>
        <p className="text-xs font-medium text-white">{title}</p>
        <p className="mt-0.5 text-[10px] text-sub">{text}</p>
      </div>
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
