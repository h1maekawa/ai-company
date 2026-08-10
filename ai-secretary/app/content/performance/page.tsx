"use client";

import { useEffect, useState } from "react";

type Published = { id: string; channel: string; title: string };
type Dashboard = {
  publishedCount: number;
  revenue: number;
  conversions: number;
  noteViews: number | null;
  xImpressions: number | null;
  linkClicks: number | null;
  ctaClicks: number | null;
  derived: Record<string, number | undefined>;
  topContent: { contentId: string; revenue: number; title: string }[];
};

const na = (v: number | null | undefined) => (v === null || v === undefined ? "N/A" : v.toLocaleString());

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function PerformancePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [published, setPublished] = useState<Published[]>([]);
  const [contentId, setContentId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const load = () => {
    fetch("/api/content/dashboard").then((r) => r.json()).then(setDashboard);
    fetch("/api/content/published").then((r) => r.json()).then((d) => setPublished(d.published ?? []));
  };
  useEffect(load, []);

  async function submit() {
    if (!contentId) return;
    const body: Record<string, unknown> = { publishedContentId: contentId, source: "manual" };
    for (const [key, value] of Object.entries(form)) {
      if (value !== "") body[key] = Number(value);
    }
    await api("/api/content/performance", "POST", body);
    setForm({});
    load();
  }

  const fields = ["impressions", "views", "likes", "comments", "linkClicks", "ctaClicks", "paidPurchases", "conversions", "revenue"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">PERFORMANCE</h2>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Published" value={dashboard?.publishedCount ?? "…"} />
        <Stat label="Revenue" value={dashboard ? `¥${dashboard.revenue.toLocaleString()}` : "…"} />
        <Stat label="Conversions" value={dashboard?.conversions ?? "…"} />
        <Stat label="note Views" value={na(dashboard?.noteViews)} />
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">手入力（API不要で必ず動作します。取得できない値は空のままでOK＝N/A）</p>
        <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
          <option value="">対象を選択</option>
          {published.map((p) => <option key={p.id} value={p.id}>[{p.channel}] {p.title}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {fields.map((f) => (
            <input
              key={f}
              value={form[f] ?? ""}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              placeholder={f}
              inputMode="numeric"
              className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-1.5 text-xs"
            />
          ))}
        </div>
        <button onClick={submit} disabled={!contentId} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">記録する</button>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">派生指標（データが揃っている場合のみ）</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <Derived label="CTR" value={dashboard?.derived.ctr} />
          <Derived label="CTA CTR" value={dashboard?.derived.ctaCtr} />
          <Derived label="Conversion Rate" value={dashboard?.derived.conversionRate} />
          <Derived label="Revenue/Content" value={dashboard?.derived.revenuePerContent} suffix="¥" />
          <Derived label="Revenue/1000 Imp" value={dashboard?.derived.revenuePer1000Impressions} suffix="¥" />
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">Top Content</p>
        <div className="mt-2 space-y-1.5">
          {(dashboard?.topContent ?? []).length === 0 && <p className="text-xs text-sub">データ不足</p>}
          {dashboard?.topContent.map((c) => (
            <div key={c.contentId} className="flex justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <span>{c.title}</span>
              <span>¥{c.revenue.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-hairline bg-ink-card p-3">
      <p className="text-[10px] text-sub">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  );
}

function Derived({ label, value, suffix }: { label: string; value?: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2">
      <p className="text-sub">{label}</p>
      <p className="mt-0.5 font-semibold">{value === undefined ? "N/A" : `${suffix ?? ""}${value.toFixed(1)}${suffix ? "" : "%"}`}</p>
    </div>
  );
}
