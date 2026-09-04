"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { ADMIN_NAV, QUICK_ACTIONS } from "@/app/lib/config/navigation";
import { useHomeStatus } from "./useHome";

type Health = {
  services: { service: string; label: string; status: string; message?: string }[];
  healthy: number;
  total: number;
};

/**
 * ホームは部署一覧ではなく「今どういう状態か」と「次に何をするか」を出す場所。
 * 部署名ではなく動詞で並べ、詳しい設定・接続確認は管理へ送る。
 */
export default function HomePage() {
  const { loading, stats, activity } = useHomeStatus();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/system/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const alerts = health?.services.filter((service) => ["warning", "disconnected"].includes(service.status)) ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-16 sm:px-8 lg:py-10">
      <header>
        <p className="text-sm font-medium text-violet-300">AI Company</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">今日は何をしますか？</h1>
        <p className="mt-2 text-sm text-slate-400">
          やりたいことを秘書に話せば、必要な担当につながります。
        </p>
      </header>

      {/* ─── 今日の状況 ─────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">今日の状況</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link
              key={stat.id}
              href={stat.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4 transition hover:border-violet-500/50 hover:bg-slate-900"
            >
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p
                className={`mt-2 text-2xl font-bold ${
                  stat.count && stat.emphasize ? "text-amber-300" : "text-white"
                }`}
              >
                {stat.count === null ? "—" : stat.count}
                <span className="ml-1 text-xs font-normal text-slate-500">件</span>
              </p>
            </Link>
          ))}
          {stats.length === 0 &&
            [0, 1, 2, 3].map((index) => (
              <div key={index} className="h-[86px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />
            ))}
        </div>
      </section>

      {/* ─── Quick Action ──────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">まず何をする？</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={`group flex items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
                action.primary
                  ? "border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/15"
                  : "border-slate-800 bg-slate-900/65 hover:border-violet-500/40 hover:bg-slate-900"
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{action.label}</span>
                <span className="block text-xs text-slate-400">{action.hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-violet-300" />
            </Link>
          ))}
        </div>
      </section>

      {/* ─── 最近の動き ─────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">最近の動き</h2>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-slate-500">読み込み中…</p>}
          {!loading && activity.length === 0 && (
            <p className="text-xs text-slate-500">まだ動きがありません。秘書に相談するところから始められます。</p>
          )}
          {activity.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-white/[0.02] px-4 py-2.5 text-sm text-slate-200 hover:border-violet-500/40"
            >
              <span className="min-w-0 truncate">{item.label}</span>
              <span className="shrink-0 text-[11px] text-slate-500">
                {item.at ? new Date(item.at).toLocaleDateString("ja-JP") : ""}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── システム状態（詳細は管理へ） ─────────── */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">システム状態</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {health ? `${health.healthy} / ${health.total} 正常` : "取得中…"}
            </p>
          </div>
          <Link href={ADMIN_NAV.href} className="text-sm text-violet-300 hover:text-violet-200">
            管理を開く →
          </Link>
        </div>
        {alerts.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>確認が必要です</strong>
              <p className="mt-0.5 text-xs text-amber-200/80">
                {alerts[0].message ?? `${alerts[0].label}を確認してください`}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
