"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, PenLine } from "lucide-react";
import { AutomationMonitor } from "@/components/note/AutomationMonitor";

type HomeData = {
  week: { publishedCount: number; revenue: number; conversions: number };
  nextActions: { label: string; href?: string }[];
  pendingRecommendations: number;
  draftSessions: number;
};

export default function ContentHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/content/home")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      {/* 監視が先、作文は後（TASK-N4）。全自動運用では「見る」が主な操作になる */}
      <AutomationMonitor />

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-xs text-sub">今週</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="投稿" value={data?.week.publishedCount ?? (loading ? "…" : 0)} />
          <Stat label="Revenue" value={data ? `¥${data.week.revenue.toLocaleString()}` : loading ? "…" : "¥0"} />
          <Stat label="Conversions" value={data?.week.conversions ?? (loading ? "…" : 0)} />
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-sm font-semibold">NEXT ACTION</p>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-sub">読み込み中…</p>}
          {!loading && (data?.nextActions.length ?? 0) === 0 && (
            <p className="text-xs text-sub">今のところ次のアクションはありません。新しい記事を作りましょう。</p>
          )}
          {data?.nextActions.map((action, i) => (
            <Link
              key={i}
              href={action.href ?? "/content"}
              className="flex items-center justify-between rounded-xl border border-hairline bg-white/[0.02] px-4 py-3 text-sm hover:border-brand/40"
            >
              <span>
                {i + 1}. {action.label}
              </span>
              <ArrowRight className="h-4 w-4 text-sub" />
            </Link>
          ))}
        </div>
      </section>

      <Link
        href="/content/note"
        className="flex items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-4 text-sm font-semibold text-brand hover:bg-brand/15"
      >
        <PenLine className="h-4 w-4" />
        自分で記事を作る（承認・微修正はXタブから）
      </Link>
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
