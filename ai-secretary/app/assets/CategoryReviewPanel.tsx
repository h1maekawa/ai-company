"use client";

import { useEffect, useState } from "react";
import { readSnapshot } from "@/app/lib/finance/browserSnapshot";
import type { TransactionReviews } from "@/app/lib/finance/flowClient";

type Snapshot<T> = { data: T | null; fetchedAt: string | null; stale: boolean; error: string | null; configured: boolean };
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

export function CategoryReviewPanel({ expectedCount, onSaved }: { expectedCount: number; onSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot<TransactionReviews> | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setSnapshot(null);
    try { setSnapshot(await readSnapshot(await fetch("/api/assets/transaction-reviews", { cache: "no-store" }))); }
    catch { setSnapshot({ data: null, fetchedAt: null, stale: true, error: "確認待ち取引を取得できません", configured: true }); }
  }
  useEffect(() => { void load(); }, []);

  async function save(id: string) {
    const category = selected[id];
    if (!category) return;
    setSaving(id); setMessage(null);
    try {
      const response = await fetch("/api/assets/transaction-reviews", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, category }) });
      if (!response.ok) throw new Error();
      setSnapshot((current) => current?.data ? { ...current, data: { ...current.data, items: current.data.items.filter((item) => item.id !== id) } } : current);
      setMessage(`「${category}」に分類しました`);
      onSaved();
    } catch { setMessage("カテゴリを保存できませんでした。Flow+連携を確認してください。"); }
    finally { setSaving(null); }
  }

  const items = snapshot?.data?.items ?? [];
  const categories = snapshot?.data?.categories ?? [];
  return <section aria-labelledby="category-review-title" className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 id="category-review-title" className="font-semibold text-white">使用カテゴリの確認</h3><p className="mt-1 text-sm text-slate-400">未分類の支出を選び、正しいカテゴリを確定します。</p></div><span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-xs text-amber-200">{items.length || expectedCount}件</span></div>
    {message && <p role="status" className="mt-3 text-sm text-amber-100">{message}</p>}
    {!snapshot && <p className="mt-4 text-sm text-slate-400">読み込み中…</p>}
    {snapshot?.stale && <p role="status" className="mt-4 text-sm text-amber-200">{snapshot.error ?? "確認待ち取引を取得できません"}</p>}
    {snapshot?.data && items.length === 0 && <p className="mt-4 text-sm text-emerald-200">分類が必要な支出はありません。</p>}
    {items.length > 0 && <ul className="mt-4 space-y-3">{items.map((item) => <li key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{item.memo || item.review_reason || item.payment_method}</p><p className="mt-1 text-xs text-slate-400">{item.date} · {item.card_issuer || item.payment_method}{item.auto_category ? ` · 候補 ${item.auto_category}` : ""}</p></div><strong className="shrink-0 tabular-nums text-white">{yen(item.amount)}</strong></div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`category-${item.id}`}>カテゴリ</label><select id={`category-${item.id}`} value={selected[item.id] ?? ""} onChange={(event) => setSelected((value) => ({ ...value, [item.id]: event.target.value }))} className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white"><option value="">カテゴリを選択</option>{categories.map((category) => <option key={category.name} value={category.name}>{category.icon} {category.name}</option>)}</select><button type="button" disabled={!selected[item.id] || saving === item.id} onClick={() => void save(item.id)} className="min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40">{saving === item.id ? "保存中…" : "確定する"}</button></div>
    </li>)}</ul>}
  </section>;
}
