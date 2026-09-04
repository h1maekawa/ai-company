"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

type HomeData = {
  week: { publishedCount: number; revenue: number; conversions: number };
  nextActions: { label: string; href?: string }[];
  pendingRecommendations: number;
  draftSessions: number;
};

type QueueData = {
  articles?: { id: string; status?: string }[];
  socialDrafts?: { id: string; status?: string }[];
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * コンテンツ事業部の「今日」。まず何をすればいいかを出し、詳しい数字は「成果」へ送る。
 * 既存APIを読むだけで、投稿ロジックには触れない。
 */
export function ContentToday({
  onOpenReview,
  onOpenCreate,
}: {
  onOpenReview: () => void;
  onOpenCreate: () => void;
}) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([getJson<HomeData>("/api/content/home"), getJson<QueueData>("/api/note/publishing/queue")]).then(
      ([homeData, queueData]) => {
        if (!alive) return;
        setHome(homeData);
        setQueue(queueData);
        setLoading(false);
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  const pendingDrafts = (queue?.socialDrafts ?? []).filter(
    (draft) => draft.status !== "published" && draft.status !== "discarded"
  ).length;
  const pendingArticles = (queue?.articles ?? []).filter(
    (article) => article.status === "draft" || article.status === "approved"
  ).length;
  const needsReview = pendingDrafts + pendingArticles;

  const todos: { label: string; onClick?: () => void; href?: string }[] = [];
  if (pendingDrafts > 0) todos.push({ label: `X投稿 ${pendingDrafts}件 要確認`, onClick: onOpenReview });
  if (pendingArticles > 0) todos.push({ label: `note下書き ${pendingArticles}件 要確認`, onClick: onOpenReview });
  for (const action of home?.nextActions ?? []) todos.push({ label: action.label, href: action.href });
  if (todos.length === 0 && !loading) todos.push({ label: "新しい投稿を作る", onClick: onOpenCreate });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="今日やること" hint="上から順に片付ければ大丈夫です" />
        {loading ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <ol className="space-y-2">
            {todos.map((todo, index) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {index + 1}. {todo.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-sub" />
                </>
              );
              const className =
                "flex w-full items-center gap-3 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3 text-left text-sm hover:border-brand/40";
              return (
                <li key={`${todo.label}-${index}`}>
                  {todo.href ? (
                    <Link href={todo.href} className={className}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={todo.onClick} className={className}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {needsReview > 0 && (
          <button
            type="button"
            onClick={onOpenReview}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm font-semibold text-brand hover:bg-brand/15"
          >
            <CheckCircle2 className="h-4 w-4" />
            確認する（{needsReview}件）
          </button>
        )}
      </Card>

      <Card>
        <CardHeader title="今週の状況" hint="細かい内訳は「成果」タブで見られます" />
        {loading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="公開した投稿" value={home?.week.publishedCount ?? 0} />
            <Stat label="売上" value={home ? `¥${home.week.revenue.toLocaleString()}` : "¥0"} />
            <Stat label="成約" value={home?.week.conversions ?? 0} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] text-sub">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
