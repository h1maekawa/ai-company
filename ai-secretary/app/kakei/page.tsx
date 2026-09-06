"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  month: string;
  connected: boolean;
  stale: boolean;
  error?: string;
  syncedAt?: string;
  totalSpent?: number;
  income?: { planned: number; actual: number };
  fixed?: { effective: number; unpaid: number };
  variable?: {
    budget: number;
    spent: number;
    remaining: number;
    dailyAllowance: number;
    daysLeft: number;
    pace: number;
  };
  byCategory?: { category: string; amount: number; count: number; average: number }[];
  needsReview?: { count: number; items: { id: string; date: string; amount: number; category: string; memo: string | null }[] };
  appUrl?: string;
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default function KakeiPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/kakei/summary")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <div className="p-6 text-sm text-gray-400">家計サマリを取得できませんでした</div>;
  if (!data) return <div className="p-6 text-sm text-gray-400">読み込み中…</div>;

  const v = data.variable;
  const cats = data.byCategory ?? [];
  const review = data.needsReview;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <header>
        <p className="text-xs text-gray-400">{data.month} の家計</p>
        <h1 className="text-3xl font-bold">
          {v ? `今月あと ${yen(v.remaining)}` : "未接続"}
        </h1>
        {v && (
          <p className="text-sm text-gray-500">
            1日あたり {yen(v.dailyAllowance)}・残り{v.daysLeft}日
            {v.pace > 1 && <span className="text-amber-600">・ペース {v.pace}（使いすぎ傾向）</span>}
          </p>
        )}
        {data.totalSpent != null && v && (
          <p className="text-sm text-gray-500">
            支出合計 {yen(data.totalSpent)}（変動費 {yen(v.spent)} / 予算 {yen(v.budget)}）
          </p>
        )}
        <Link href="/chat?node=kakei" className="mt-1 inline-block text-xs text-blue-600 underline">
          家計を秘書に相談する →
        </Link>

        {!data.connected && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
            家計簿アプリと未接続です。HOUSEHOLD_API_URL と HOUSEHOLD_IMPORT_SECRET を設定してください。
            {data.error && <span className="block text-amber-600">{data.error}</span>}
          </p>
        )}
        {data.stale && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
            家計簿アプリに接続できないため、保存済みの集計を表示しています
            {data.syncedAt && `（${data.syncedAt.slice(0, 16).replace("T", " ")} 時点）`}
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-600">変動費のカテゴリ内訳</h2>
        <ul className="space-y-1">
          {cats.map((c) => (
            <li key={c.category} className="flex justify-between border-b py-1 text-sm">
              <span>
                {c.category}
                {c.count > 0 && <span className="ml-2 text-xs text-gray-400">{c.count}件・平均 {yen(c.average)}</span>}
              </span>
              <span className="tabular-nums">{yen(c.amount)}</span>
            </li>
          ))}
          {cats.length === 0 && <li className="text-sm text-gray-400">データがありません</li>}
        </ul>
        {data.fixed && (
          <p className="mt-2 text-xs text-gray-400">
            固定費 {yen(data.fixed.effective)}（未払い {yen(data.fixed.unpaid)}）
          </p>
        )}
      </section>

      {review && review.count > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-600">要確認 {review.count}件</h2>
          <ul className="space-y-1">
            {review.items.map((row) => (
              <li key={row.id} className="flex justify-between border-b py-1 text-sm">
                <span>
                  {row.memo || row.category || "（内容なし）"}
                  <span className="ml-2 text-xs text-gray-400">{row.date}</span>
                </span>
                <span className="tabular-nums">{yen(row.amount)}</span>
              </li>
            ))}
          </ul>
          {data.appUrl && (
            <a
              href={data.appUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-blue-600 underline"
            >
              家計簿アプリで修正する →
            </a>
          )}
        </section>
      )}
    </main>
  );
}
