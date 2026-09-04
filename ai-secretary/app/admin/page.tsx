"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_SECTIONS } from "@/app/lib/config/navigation";

type Health = {
  services: { service: string; label: string; status: string; message?: string }[];
  healthy: number;
  total: number;
};

const DOT: Record<string, string> = {
  connected: "text-emerald-400",
  warning: "text-amber-400",
};

/**
 * 管理画面。毎日使う場所ではないので、日常のナビからは切り離してここへ集約する。
 * Knowledge / 接続 / 各種設定 / AI Company自体の改善 への入口だけを持つ。
 */
export default function AdminPage() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/system/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-16 sm:px-8 lg:py-10">
      <header>
        <p className="text-sm font-medium text-violet-300">管理</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">AI Companyの裏側</h1>
        <p className="mt-2 text-sm text-slate-400">
          毎日は使いません。知識の整理・外部サービスの接続確認・詳細設定はここから。
        </p>
      </header>

      <section className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">
            接続状態 {health ? `${health.healthy} / ${health.total} 正常` : "取得中…"}
          </p>
          <Link href="/connections" className="text-sm text-violet-300 hover:text-violet-200">
            詳しく見る →
          </Link>
        </div>
        {health && (
          <div className="mt-3 flex flex-wrap gap-2">
            {health.services.map((service) => (
              <span key={service.service} className="rounded-full bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300">
                <span className={DOT[service.status] ?? "text-slate-500"}>●</span> {service.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {ADMIN_SECTIONS.map((section) => (
        <section key={section.label} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{section.label}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {section.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4 transition hover:border-violet-500/50 hover:bg-slate-900"
              >
                <p className="text-sm font-semibold text-white">
                  <span className="mr-2" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
