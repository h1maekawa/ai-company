"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode; mobile?: boolean };
export const DAILY_NAV_ITEMS: NavItem[] = [
  { href: "/investing", label: "注目", icon: "✦" },
  { href: "/investing/watchlist", label: "ウォッチ", icon: "☆" },
  { href: "/investing/holdings", label: "保有銘柄", icon: "▤" },
  { href: "/investing/research", label: "Research", icon: "⌕" },
  { href: "/investing/news", label: "News", icon: "◉" },
];
export const MORE_NAV_ITEMS: NavItem[] = [
  { href: "/investing/market", label: "市場", icon: "▥" },
  { href: "/investing/opportunities", label: "機会", icon: "✦" },
  { href: "/investing/portfolio", label: "Portfolio", icon: "◴" },
  { href: "/investing/companies", label: "企業", icon: "▣" },
  { href: "/investing/learning", label: "学び", icon: "◇" },
  { href: "/investing/analysis", label: "AI分析", icon: "✧" },
  { href: "/investing/allocation", label: "配分・集中度", icon: "◫" },
  { href: "/investing/policy", label: "投資判断", icon: "◇" },
  { href: "/investing/screening", label: "スクリーニング", icon: "⌕" },
  { href: "/investing/transactions", label: "取引履歴", icon: "▦" },
  { href: "/investing/dividends", label: "配当", icon: "◈" },
  { href: "/investing/import", label: "CSV取込", icon: "↑" },
  { href: "/investing/settings", label: "設定", icon: "⚙" },
];
export const NAV_ITEMS: NavItem[] = [...DAILY_NAV_ITEMS, ...MORE_NAV_ITEMS];

export function InvestingShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  return <div className="min-h-screen text-white">
    <header className="border-b border-slate-800 px-4 pb-3 pt-5 sm:px-7">
      <p className="text-xs text-violet-300">投資 · {title}</p>
      <nav aria-label="投資内のナビゲーション" className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {DAILY_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-sm ${pathname === item.href ? "bg-violet-500 text-white" : "border border-slate-700 text-slate-300 hover:border-violet-500"}`}>{item.label}</Link>)}
        <details className="relative shrink-0"><summary className="flex min-h-11 cursor-pointer items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300">その他</summary><div className="absolute right-0 z-20 mt-1 max-h-64 min-w-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">{MORE_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800">{item.label}</Link>)}</div></details>
      </nav>
    </header>
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-7 lg:pb-10">{children}</main>
  </div>;
}
