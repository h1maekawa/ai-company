"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import {
  Bell,
  Briefcase,
  ChevronLeft,
  CircleDollarSign,
  Filter,
  LayoutDashboard,
  LineChart,
  Menu,
  Newspaper,
  PieChart,
  Search,
  Settings,
  Sparkles,
  Star,
  User,
  X,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** モバイル下部ナビに出す項目 */
  mobile?: boolean;
};

const ICON = "h-[18px] w-[18px]";

export const NAV_ITEMS: NavItem[] = [
  { href: "/investing", label: "ダッシュボード", icon: <LayoutDashboard className={ICON} />, mobile: true },
  { href: "/investing/holdings", label: "保有株", icon: <Briefcase className={ICON} />, mobile: true },
  { href: "/investing/news", label: "ニュース", icon: <Newspaper className={ICON} />, mobile: true },
  { href: "/investing/analysis", label: "AI分析", icon: <Sparkles className={ICON} />, mobile: true },
  { href: "/investing/portfolio", label: "ポートフォリオ", icon: <PieChart className={ICON} /> },
  { href: "/investing/screening", label: "スクリーニング", icon: <Filter className={ICON} /> },
  { href: "/investing/watchlist", label: "ウォッチリスト", icon: <Star className={ICON} /> },
  { href: "/investing/dividends", label: "配当管理", icon: <CircleDollarSign className={ICON} /> },
  { href: "/investing/transactions", label: "取引履歴", icon: <LineChart className={ICON} /> },
  { href: "/investing/settings", label: "設定", icon: <Settings className={ICON} /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/investing") return pathname === "/investing";
  return pathname.startsWith(href);
}

/* ─── 銘柄検索 ───────────────────────────────────────── */

function TickerSearch({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = query.trim().toUpperCase();
    if (!code) return;
    setQuery("");
    onDone?.();
    router.push(`/investing/holdings/${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={submit} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="銘柄を検索（NVDA / AAPL / 8035）"
        aria-label="銘柄を検索"
        className="w-full rounded-xl border border-hairline bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-sub/70 focus:border-brand/50 focus:bg-white/[0.06] sm:w-72"
      />
    </form>
  );
}

/* ─── Sidebar ────────────────────────────────────────── */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-brand-soft font-semibold text-brand"
                : "text-sub hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ─── Shell ──────────────────────────────────────────── */

export function InvestingShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-base text-white">
      {/* 左固定サイドバー（lg以上） */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-ink-card/60 px-3 py-5 backdrop-blur lg:flex">
        <Link href="/investing" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold">
            AI
          </span>
          <span className="text-sm font-semibold tracking-tight">投資パートナー</span>
        </Link>

        <SidebarNav />

        <div className="mt-auto px-2 pt-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-sub transition-colors hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            AI Companyに戻る
          </Link>
        </div>
      </aside>

      {/* モバイル用ドロワー */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-hairline bg-ink-card px-3 py-5">
            <div className="mb-5 flex items-center justify-between px-2">
              <span className="text-sm font-semibold">投資パートナー</span>
              <button onClick={() => setMenuOpen(false)} aria-label="メニューを閉じる">
                <X className="h-5 w-5 text-sub" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
            <Link
              href="/"
              className="mt-4 flex items-center gap-2 px-3 py-2 text-xs text-sub"
              onClick={() => setMenuOpen(false)}
            >
              <ChevronLeft className="h-4 w-4" />
              AI Companyに戻る
            </Link>
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        {/* 上部ヘッダー */}
        <header className="sticky top-0 z-20 border-b border-hairline bg-ink-base/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="メニューを開く"
              className="rounded-lg p-1.5 text-sub hover:bg-white/5 hover:text-white lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden sm:block">
                <TickerSearch />
              </div>
              <button
                aria-label="通知"
                className="rounded-lg p-2 text-sub transition-colors hover:bg-white/5 hover:text-white"
              >
                <Bell className="h-[18px] w-[18px]" />
              </button>
              <Link
                href="/investing/settings"
                aria-label="プロフィール・設定"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-sub transition-colors hover:text-white"
              >
                <User className="h-[18px] w-[18px]" />
              </Link>
            </div>
          </div>

          {/* モバイルは検索を2段目に */}
          <div className="px-4 pb-3 sm:hidden">
            <TickerSearch />
          </div>
        </header>

        <main className="px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* モバイル下部ナビ */}
      <MobileNav onMenu={() => setMenuOpen(true)} />
    </div>
  );
}

function MobileNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-ink-card/95 backdrop-blur lg:hidden">
      <div className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
                active ? "text-brand" : "text-sub"
              }`}
            >
              {item.icon}
              <span>{item.label === "ダッシュボード" ? "ホーム" : item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenu}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] text-sub"
        >
          <Menu className={ICON} />
          <span>メニュー</span>
        </button>
      </div>
    </nav>
  );
}
