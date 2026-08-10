"use client";

import { useEffect, useState } from "react";

type Published = { id: string; title: string; channel: string };
type Offer = { id: string; name: string };
type RevenueResp = {
  total: number;
  revenueEvents: { id: string; type: string; amount: number; currency: string; occurredAt: string; source: string }[];
  byType: Record<string, number>;
};

const REVENUE_TYPES = ["paid-note", "affiliate", "membership", "product", "service", "timebox", "other"];
const PERIODS = [
  ["today", "今日"],
  ["week", "今週"],
  ["month", "今月"],
  ["all", "累計"],
] as const;

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function RevenuePage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("all");
  const [data, setData] = useState<RevenueResp | null>(null);
  const [published, setPublished] = useState<Published[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [contentId, setContentId] = useState("");
  const [type, setType] = useState(REVENUE_TYPES[0]);
  const [amount, setAmount] = useState("");
  const [offerId, setOfferId] = useState("");

  const load = () => {
    fetch(`/api/content/revenue?period=${period}`).then((r) => r.json()).then(setData);
    fetch("/api/content/published").then((r) => r.json()).then((d) => setPublished(d.published ?? []));
    fetch("/api/content/offers").then((r) => r.json()).then((d) => setOffers(d.offers ?? []));
  };
  useEffect(load, [period]);

  async function submit() {
    if (!contentId || !amount) return;
    await api("/api/content/revenue", "POST", {
      publishedContentId: contentId,
      type,
      amount: Number(amount),
      currency: "JPY",
      offerId: offerId || undefined,
      source: "manual",
    });
    setAmount("");
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">REVENUE</h2>

      <div className="flex gap-1">
        {PERIODS.map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)} className={`rounded-lg px-3 py-1.5 text-xs ${period === id ? "bg-brand text-white" : "bg-white/5 text-sub"}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-xs text-sub">合計Revenue</p>
        <p className="mt-1 text-2xl font-bold">¥{(data?.total ?? 0).toLocaleString()}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {REVENUE_TYPES.map((t) => (
            <div key={t} className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-1.5">
              <p className="text-sub">{t}</p>
              <p className="font-semibold">¥{(data?.byType[t] ?? 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">手入力（Revenueは本人入力/正式API/importのみ。AIは生成しません）</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-2 text-xs">
            <option value="">対象を選択</option>
            {published.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-2 text-xs">
            {REVENUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-2 text-xs">
            <option value="">Offer（任意）</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" inputMode="numeric" className="rounded-lg border border-hairline bg-white/[0.02] px-2 py-2 text-xs" />
        </div>
        <button onClick={submit} disabled={!contentId || !amount} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">記録する</button>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">RevenueEvent履歴</p>
        <div className="mt-2 space-y-1.5">
          {(data?.revenueEvents ?? []).length === 0 && <p className="text-xs text-sub">まだありません。</p>}
          {data?.revenueEvents.map((r) => (
            <div key={r.id} className="flex justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <span>[{r.type}] {r.occurredAt.slice(0, 10)}（{r.source}）</span>
              <span>¥{r.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
