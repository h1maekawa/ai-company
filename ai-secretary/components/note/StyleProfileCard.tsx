"use client";

/**
 * 文体プロファイルの表示 — 要件4 / TASK-N3
 *
 * 目的は「種が入っているか一目で分かる」こと。
 * 各次元が何を根拠に決まっているか（本人指定 / 本人の投稿 / 実績 / 未学習）と
 * 最終更新を出し、種入れが済んでいなければ手順を案内する。
 */

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  STYLE_DIMENSIONS,
  STYLE_DIMENSION_LABELS,
  STYLE_SOURCE_LABELS,
  type StyleFieldSource,
  type StyleLearningSources,
  type StyleProfile,
} from "@/app/lib/note/styleProfileTypes";
import { relativeAge } from "@/app/lib/freshness";
import { Skeleton } from "@/components/ui/primitives";

type Response = StyleProfile & { sources?: StyleLearningSources; error?: string };

/** 出所の強さを色で示す。本人由来が強い＝緑、未学習＝グレー */
const SOURCE_STYLE: Record<StyleFieldSource, string> = {
  manual: "border-gain/25 bg-gain/10 text-gain",
  "own-posts": "border-brand/25 bg-brand/10 text-brand",
  performance: "border-hairline bg-white/5 text-slate-300",
  "external-pattern": "border-hairline bg-white/5 text-sub",
  unset: "border-hairline bg-white/5 text-sub",
};

export function StyleProfileCard() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/note/style-profile")
      .then((r) => r.json())
      .then((json: Response) => setData(json))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <Skeleton className="h-56 rounded-2xl" />;
  if (!data || data.error) return null;

  const sources = data.sources;

  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-sub" />
            文体の学習状況
          </p>
          <p className="mt-1 text-[11px] text-sub">
            最終更新 {data.updatedAt ? relativeAge(data.updatedAt) : "—"}
          </p>
        </div>
        {sources && <SeedBadge sources={sources} />}
      </div>

      {sources && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-hairline bg-white/[0.02] p-3 text-[11px] text-sub sm:grid-cols-4">
          <Count label="本人の過去投稿" value={sources.archive} emphasize={sources.archive === 0} />
          <Count label="本人が編集" value={sources.editedByUser} />
          <Count label="使用済み投稿" value={sources.drafts} />
          <Count label="実績レコード" value={sources.performance} />
        </div>
      )}

      {sources && !sources.seeded && (
        <div className="mt-3 rounded-lg border border-loss/25 bg-loss/10 p-3 text-[11px] leading-relaxed text-loss">
          <p className="font-medium">文体の種が入っていません</p>
          <p className="mt-1 text-loss/80">
            本人の過去投稿が0件のため、学習は実績とAI下書きだけに依存しています。
            Xアーカイブを取り込むと初期精度が上がります。
          </p>
          <code className="mt-2 block rounded bg-black/30 px-2 py-1 text-[10px] text-slate-300">
            npm run import:x-archive -- &lt;アーカイブZIP&gt; --account=maemichi --write
          </code>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {STYLE_DIMENSIONS.map((key) => {
          const field = data[key];
          if (!field) return null;
          return (
            <li key={key} className="flex items-start justify-between gap-3 text-xs">
              <span className="shrink-0 text-slate-300">{STYLE_DIMENSION_LABELS[key]}</span>
              <span className="min-w-0 flex-1 text-right">
                <span className="block truncate text-white">
                  {field.description || "—"}
                </span>
                <span
                  className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] ${
                    SOURCE_STYLE[field.source]
                  }`}
                >
                  {STYLE_SOURCE_LABELS[field.source]}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SeedBadge({ sources }: { sources: StyleLearningSources }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        sources.seeded
          ? "border-gain/25 bg-gain/10 text-gain"
          : "border-loss/25 bg-loss/10 text-loss"
      }`}
    >
      {sources.seeded ? "種入れ済み" : "種入れ未了"}
    </span>
  );
}

function Count({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <span className="block">
      <span className="block text-[10px]">{label}</span>
      <span
        className={`mt-0.5 block text-sm font-semibold tabular-nums ${
          emphasize ? "text-loss" : "text-white"
        }`}
      >
        {value.toLocaleString("ja-JP")}
      </span>
    </span>
  );
}
