"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readSnapshot } from "@/app/lib/finance/browserSnapshot";
import type { CardActivity, FinanceSummary, FlowDebtSummary } from "@/app/lib/finance/flowClient";
import { CategoryReviewPanel } from "./CategoryReviewPanel";

type Snapshot<T> = { data: T | null; fetchedAt: string | null; stale: boolean; error: string | null; configured: boolean };
type Tab = "summary" | "household" | "cards" | "debt";
const tabs: { id: Tab; label: string }[] = [
  { id: "summary", label: "資産サマリー" }, { id: "household", label: "家計・支出" },
  { id: "cards", label: "クレジットカード" }, { id: "debt", label: "借入・貸し借り" },
];
const yen = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? `¥${value.toLocaleString("ja-JP")}` : "未取得";

export function AssetsDashboard({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [summary, setSummary] = useState<Snapshot<FinanceSummary> | null>(null);
  const [cards, setCards] = useState<Snapshot<CardActivity> | null>(null);
  const [debts, setDebts] = useState<Snapshot<FlowDebtSummary> | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) {
        last = Date.now(); setCards(null); setDebts(null); setRevision((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets/summary", { cache: "no-store" }).then(readSnapshot).then((value) => { if (!cancelled) setSummary(value); }).catch((error) => { if (!cancelled) setSummary({ data: null, fetchedAt: null, stale: true, error: error instanceof Error ? error.message : "Flow+から最新値を取得できません", configured: true }); });
    return () => { cancelled = true; };
  }, [revision]);
  useEffect(() => {
    if (tab !== "cards" || cards) return;
    let cancelled = false;
    fetch("/api/assets/card-activity?limit=20", { cache: "no-store" }).then(readSnapshot).then((value) => { if (!cancelled) setCards(value); }).catch((error) => { if (!cancelled) setCards({ data: null, fetchedAt: null, stale: true, error: error instanceof Error ? error.message : "カード明細を取得できません", configured: true }); });
    return () => { cancelled = true; };
  }, [tab, cards]);
  useEffect(() => {
    if (tab !== "debt" || debts) return;
    let cancelled = false;
    fetch("/api/assets/debts", { cache: "no-store" }).then(readSnapshot).then((value) => { if (!cancelled) setDebts(value); }).catch((error) => { if (!cancelled) setDebts({ data: null, fetchedAt: null, stale: true, error: error instanceof Error ? error.message : "Flow+から最新値を取得できません", configured: true }); });
    return () => { cancelled = true; };
  }, [tab, debts]);
  const data = summary?.data;
  const activeCard = cards?.data?.items.find((item) => item.id === selectedCard);
  return <main className="mx-auto min-h-screen max-w-6xl px-4 pb-24 pt-10 text-white sm:px-7 lg:pb-10">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-emerald-300">Flow+ · 読み取り専用</p><h1 className="mt-1 text-3xl font-semibold">資産</h1><p className="mt-2 text-sm text-slate-400">自分のお金全体を、Flow+の集計値で確認します。</p></div>
      <Link href="/investing" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-emerald-500">投資詳細を見る →</Link>
    </header>
    <button type="button" className="mb-4 min-h-11 rounded-xl border border-slate-700 px-4" onClick={() => { setCards(null); setDebts(null); setRevision((value) => value + 1); }}>再取得</button>
    {summary?.stale && <p role="status" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{summary.error ?? "Flow+から最新値を取得できません"}。{summary.fetchedAt ? `最後の取得: ${new Date(summary.fetchedAt).toLocaleString("ja-JP")}` : "保存済みの値はありません。"}</p>}
    <section aria-label="資産の概要" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["総資産", data?.assets.total], ["現金・貯金", data?.assets.cash], ["投資資産", data?.assets.investment], ["その他", data?.assets.other], ["今月支出", data?.expenses.total]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{yen(value as number | null | undefined)}</p></div>)}
    </section>
    <p className="mt-3 text-xs text-slate-500">{summary?.fetchedAt ? `Flow+取得: ${new Date(summary.fetchedAt).toLocaleString("ja-JP")}` : "Flow+データ未取得"}{data?.calculated_at ? ` · 計算: ${new Date(data.calculated_at).toLocaleString("ja-JP")}` : ""}</p>
    <nav aria-label="資産の表示切替" className="mt-8 flex gap-2 overflow-x-auto pb-2">{tabs.map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); window.history.replaceState(null, "", item.id === "summary" ? "/assets" : `/assets?tab=${item.id}`); }} aria-current={tab === item.id ? "page" : undefined} className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${tab === item.id ? "bg-emerald-500 text-slate-950" : "border border-slate-700 text-slate-300"}`}>{item.label}</button>)}</nav>
    {tab === "summary" && <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="text-lg font-semibold">資産サマリー</h2><p className="mt-2 text-sm text-slate-400">資産合計と内訳はFlow+の値です。投資商品の分析と判断は投資画面で確認できます。</p><dl className="mt-5 grid gap-4 sm:grid-cols-2">{[["現金", data?.assets.cash], ["投資", data?.assets.investment], ["その他", data?.assets.other], ["総資産", data?.assets.total]].map(([label, value]) => <div key={String(label)} className="border-b border-slate-800 pb-3"><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-xl tabular-nums">{yen(value as number | null | undefined)}</dd></div>)}</dl><p className="mt-4 text-xs text-slate-500">推移データが提供されていないため、グラフは表示していません。</p></section>}
    {tab === "household" && <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="text-lg font-semibold">家計・支出</h2><dl className="mt-5 grid gap-4 sm:grid-cols-2">{[["今月収入", data?.income.actual], ["固定費", data?.expenses.fixed], ["変動費", data?.expenses.variable], ["自由に使える額", data?.cashflow.free_to_spend], ["1日あたり", data?.cashflow.daily_allowance], ["貯金配分", data?.capacity.saving], ["資産形成配分", data?.capacity.asset_building], ["自由資金", data?.capacity.free_cash]].map(([label, value]) => <div key={String(label)} className="border-b border-slate-800 pb-3"><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-xl tabular-nums">{yen(value as number | null | undefined)}</dd></div>)}</dl>{data?.review.negative_balance_risk && <p className="mt-5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">残高リスクがあります。Flow+で確認してください。</p>}<CategoryReviewPanel expectedCount={data?.review.unreviewed_transactions ?? 0} onSaved={() => setRevision((value) => value + 1)} /></section>}
    {tab === "cards" && <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="text-lg font-semibold">クレジットカード</h2>{cards?.stale && <p role="status" className="mt-3 text-sm text-amber-200">{cards.error ?? "Flow+から最新値を取得できません"}{cards.fetchedAt ? ` · 最終取得 ${new Date(cards.fetchedAt).toLocaleString("ja-JP")}` : ""}</p>}<p className="mt-2 text-xs text-slate-500">未確認 {data?.review.unreviewed_transactions ?? "未取得"}件 · カード割当待ち {data?.review.unassigned_card_usage ?? "未取得"}件</p><div className="mt-5 space-y-2">{cards?.data?.items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedCard(item.id)} className="flex min-h-14 w-full items-center justify-between rounded-xl border border-slate-800 p-3 text-left hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"><span><strong className="block text-sm">{item.merchant}</strong><span className="text-xs text-slate-400">{item.card} · {item.date} · {item.review_status}</span></span><span className="tabular-nums">{yen(item.amount)}</span></button>)}{cards?.data?.items.length === 0 && <p className="text-sm text-slate-400">表示できるカード明細はありません。</p>}{!cards && <p className="text-sm text-slate-400">読み込み中…</p>}</div>{activeCard && <div className="mt-5 rounded-xl border border-emerald-500/30 p-4 text-sm"><div className="flex justify-between"><h3 className="font-semibold">明細</h3><button type="button" onClick={() => setSelectedCard(null)} aria-label="明細を閉じる" className="min-h-11 px-2">閉じる</button></div><dl className="mt-2 space-y-1 text-slate-300"><div>加盟店: {activeCard.merchant}</div><div>金額: {yen(activeCard.amount)}</div><div>利用日: {activeCard.date}</div><div>カード: {activeCard.card}</div><div>カテゴリ: {activeCard.category ?? "未取得"}</div><div>確認状態: {activeCard.review_status}</div><div>Transaction ID: {activeCard.id}</div></dl></div>}</section>}
    {tab === "debt" && <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <h2 className="text-lg font-semibold">借入・貸し借り</h2>
      {debts?.stale && <p role="status" className="mt-3 text-sm text-amber-200">{debts.error ?? "Flow+から最新値を取得できません"}{debts.fetchedAt ? ` · 最終取得 ${new Date(debts.fetchedAt).toLocaleString("ja-JP")}` : ""}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 p-4"><dt className="text-sm text-slate-400">借りている</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{yen(debts?.data?.totals.borrowed)}</dd></div>
        <div className="rounded-xl border border-slate-800 p-4"><dt className="text-sm text-slate-400">貸している</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{yen(debts?.data?.totals.lent)}</dd></div>
      </dl>
      {!debts && <p className="mt-5 text-sm text-slate-400">読み込み中…</p>}
      {debts?.stale && debts.data && <p className="mt-3 text-sm text-amber-200">最新情報を取得できないため、前回取得時点の情報を表示しています</p>}
      {debts?.data?.items.length === 0 && <p className="mt-5 text-sm text-slate-400">{debts.stale ? "前回取得時点では、未精算の貸し借りはありませんでした" : "未精算の貸し借りはありません"}</p>}
      {debts?.data?.items.length ? <>
        <div className="mt-5 space-y-3 md:hidden">{debts.data.items.map((item) => <article key={item.id} className="rounded-xl border border-slate-800 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.counterparty}</h3><p className="mt-1 text-xs text-slate-400">{item.direction === "borrowed" ? "借りている" : "貸している"} · {item.date}</p></div><strong className="tabular-nums">{yen(item.amount)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400"><div><dt>返済期限</dt><dd className="mt-1 text-slate-200">{item.due_date ?? "未設定"}</dd></div><div><dt>状態</dt><dd className="mt-1 text-slate-200">{item.is_settled ? "精算済み" : "未精算"}</dd></div></dl></article>)}</div>
        <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr>{["相手", "方向", "残額", "日付", "返済期限", "状態"].map((label) => <th key={label} className="border-b border-slate-800 px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{debts.data.items.map((item) => <tr key={item.id}><td className="border-b border-slate-800 px-3 py-3">{item.counterparty}</td><td className="border-b border-slate-800 px-3 py-3">{item.direction === "borrowed" ? "借りている" : "貸している"}</td><td className="border-b border-slate-800 px-3 py-3 tabular-nums">{yen(item.amount)}</td><td className="border-b border-slate-800 px-3 py-3">{item.date}</td><td className="border-b border-slate-800 px-3 py-3">{item.due_date ?? "未設定"}</td><td className="border-b border-slate-800 px-3 py-3">{item.is_settled ? "精算済み" : "未精算"}</td></tr>)}</tbody></table></div>
      </> : null}
    </section>}
  </main>;
}
