"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

type Dashboard = {
  publishedCount: number;
  revenue: number;
  conversions: number;
  noteViews: number | null;
  xImpressions: number | null;
  linkClicks: number | null;
  topContent: { contentId: string; revenue: number; title: string }[];
};

type Learning = { id: string; status?: string; observation?: string; interpretation?: string };

const PERIODS = [
  ["week", "今週"],
  ["month", "今月"],
  ["all", "累計"],
] as const;

type Period = (typeof PERIODS)[number][0];

/** 詳しい入力・編集画面。日常の投稿作成とは分けて、必要なときだけ開く */
const DETAIL_LINKS = [
  { href: "/content/performance", label: "投稿結果を入力する", hint: "表示数・クリック・売上の記録" },
  { href: "/content/revenue", label: "売上を記録する", hint: "有料note・アフィリエイトなどの内訳" },
  { href: "/content/learnings", label: "学びと次の記事候補", hint: "結果から次に何を書くかを決める" },
  { href: "/content/published", label: "公開済みの一覧", hint: "これまでに出したX投稿・note記事" },
];

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const na = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString();

/**
 * コンテンツ事業部の「成果」。Content Business OS の Performance / Revenue /
 * Learnings / Published を1画面に集約し、細かい入力は各詳細画面へ送る。
 */
export function ContentResults() {
  const [period, setPeriod] = useState<Period>("week");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getJson<Dashboard>(`/api/content/dashboard?period=${period}`),
      getJson<{ learnings?: Learning[] }>("/api/content/learnings"),
    ]).then(([dashboardData, learningData]) => {
      if (!alive) return;
      setDashboard(dashboardData);
      setLearnings(learningData?.learnings ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [period]);

  const approvedLearnings = learnings.filter((item) => item.status === "approved").slice(0, 3);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="投稿の成果"
          hint="表示数や売上は、記録した分だけ表示されます"
          action={
            <div className="flex gap-1 rounded-lg border border-hairline p-0.5">
              {PERIODS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] ${
                    period === id ? "bg-brand/15 font-semibold text-brand" : "text-sub"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        {loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="公開した投稿" value={na(dashboard?.publishedCount)} />
            <Stat label="売上" value={dashboard ? `¥${dashboard.revenue.toLocaleString()}` : "—"} />
            <Stat label="成約" value={na(dashboard?.conversions)} />
            <Stat label="noteの閲覧" value={na(dashboard?.noteViews)} />
            <Stat label="Xの表示回数" value={na(dashboard?.xImpressions)} />
            <Stat label="リンククリック" value={na(dashboard?.linkClicks)} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="よく読まれた・売れた投稿" hint="売上が大きい順" />
        {loading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : (dashboard?.topContent.length ?? 0) === 0 ? (
          <p className="text-xs text-sub">まだ売上の記録がありません。記録は「投稿結果を入力する」から追加できます。</p>
        ) : (
          <ul className="space-y-2">
            {dashboard?.topContent.map((item) => (
              <li
                key={item.contentId}
                className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white/[0.02] px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0 font-semibold text-gain">¥{item.revenue.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="ここまでの学び" hint="採用済みの学びだけを表示します" />
        {loading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : approvedLearnings.length === 0 ? (
          <p className="text-xs text-sub">採用済みの学びはまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {approvedLearnings.map((item) => (
              <li key={item.id} className="rounded-xl border border-hairline bg-white/[0.02] px-4 py-3">
                <p className="text-sm">{item.observation}</p>
                {item.interpretation && <p className="mt-1 text-[11px] leading-relaxed text-sub">{item.interpretation}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="詳しく記録・分析する" hint="毎日は使いません。必要なときだけ開いてください" />
        <div className="grid gap-2 sm:grid-cols-2">
          {DETAIL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3 hover:border-brand/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{link.label}</span>
                <span className="block text-[10px] text-sub">{link.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-sub" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-hairline bg-white/[0.02] p-3">
      <p className="text-[10px] text-sub">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  );
}
