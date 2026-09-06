"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  month: string; total: number; count: number;
  byCategory: Record<string, number>; remaining: number | null;
  needsReview: { sourceId: string; date: string; merchantRaw: string; merchantNorm: string; amount: number; category: string }[];
  categories: string[]; connected: boolean;
};
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default function KakeiPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetch("/api/kakei/summary").then((r) => r.json()).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []);

  const fix = async (row: Summary["needsReview"][number], category: string) => {
    if (!data) return;
    setBusy(row.sourceId);
    await fetch("/api/kakei/recategorize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: data.month, sourceId: row.sourceId, category, merchantNorm: row.merchantNorm }),
    });
    setBusy(null);
    await load();
  };

  if (!data) return <div className="p-6 text-sm text-gray-400">読み込み中…</div>;

  const cats = Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <header>
        <p className="text-xs text-gray-400">{data.month} の家計</p>
        <h1 className="text-3xl font-bold">
          {data.remaining != null ? `今月あと ${yen(data.remaining)}` : `支出 ${yen(data.total)}`}
        </h1>
        <p className="text-sm text-gray-500">
          支出合計 {yen(data.total)}（{data.count}件）
          {data.needsReview.length === 0 ? "・未分類なし" : `・要確認 ${data.needsReview.length}件`}
        </p>
        <Link href="/chat?node=kakei" className="mt-1 inline-block text-xs text-blue-600 underline">
          家計を秘書に相談する →
        </Link>
        {!data.connected && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
            家計簿アプリと未接続です。環境変数（HOUSEHOLD_*）と cron を設定してください。
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-600">カテゴリ内訳</h2>
        <ul className="space-y-1">
          {cats.map(([c, v]) => (
            <li key={c} className="flex justify-between border-b py-1 text-sm">
              <span>{c}</span><span className="tabular-nums">{yen(v)}</span>
            </li>
          ))}
          {cats.length === 0 && <li className="text-sm text-gray-400">データがありません</li>}
        </ul>
      </section>

      {data.needsReview.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-600">要確認（1タップで確定・学習）</h2>
          <ul className="space-y-2">
            {data.needsReview.map((row) => (
              <li key={row.sourceId} className="flex items-center gap-2 rounded border p-2 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{row.merchantRaw}</div>
                  <div className="text-xs text-gray-400">{row.date}・{yen(row.amount)}</div>
                </div>
                <select
                  defaultValue={row.category}
                  disabled={busy === row.sourceId}
                  onChange={(e) => fix(row, e.target.value)}
                  className="rounded border px-2 py-1"
                >
                  {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
