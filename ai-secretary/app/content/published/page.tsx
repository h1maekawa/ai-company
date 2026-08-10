"use client";

import { useEffect, useState } from "react";

type Published = { id: string; channel: string; title: string; url?: string; publishedAt: string; contentGoal?: string };

export default function PublishedPage() {
  const [items, setItems] = useState<Published[]>([]);

  useEffect(() => {
    fetch("/api/content/published").then((r) => r.json()).then((d) => setItems(d.published ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">PUBLISHED</h2>
      <p className="text-sm text-sub">本人操作または正式なPublish連携成功時のみここに記録されます。Draftは含まれません。</p>
      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <div className="space-y-1.5">
          {items.length === 0 && <p className="text-xs text-sub">まだ公開したものはありません。</p>}
          {items.map((p) => (
            <div key={p.id} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{p.channel}</span>
                <span className="text-sub">{p.publishedAt.slice(0, 10)}</span>
              </div>
              <p className="mt-1 font-semibold">{p.title}</p>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.url}</a>}
              <p className="mt-1 text-[10px] text-sub">Content Goal: {p.contentGoal ?? "特に決めない"}</p>
              <a href="/content/performance" className="mt-2 inline-block rounded bg-brand/20 px-2 py-1 text-[10px] text-brand">結果を入力する</a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
