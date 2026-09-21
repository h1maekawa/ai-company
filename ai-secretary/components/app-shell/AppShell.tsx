"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, CheckSquare, Home, Menu, Plus, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { isNavActive } from "@/app/lib/config/navigation";
import { AppSidebar } from "./AppSidebar";

/** チャット・壁打ちは1画面1目的の集中モードなので下部ナビを重ねない（ヘッダーに戻る導線がある） */
const FULLSCREEN_PREFIXES = ["/chat", "/grill", "/login"];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 投資画面は銘柄検索・投資ナビを備えた専用Shellを持つため、二重Sidebarを避ける。
  if (pathname.startsWith("/investing")) return children;

  const fullscreen = FULLSCREEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800/80 lg:block">
        <AppSidebar />
      </aside>

      <button
        type="button"
        aria-label="メニューを開く"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-xl border border-slate-700 bg-slate-900/95 p-2 text-slate-200 shadow-lg lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="メニューを閉じる" className="absolute inset-0 bg-black/65" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 max-w-[86vw] border-r border-slate-700 shadow-2xl">
            <button
              aria-label="メニューを閉じる"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 p-2 text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
            <AppSidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className={`min-h-screen lg:pl-60 ${fullscreen ? "" : "pb-16 lg:pb-0"}`}>{children}</div>

      {!fullscreen && <MobileTabBar pathname={pathname} />}
    </div>
  );
}

/** CEOが片手で主要判断へ到達できる固定5ナビ。詳細領域はWorkに集約する。 */
function MobileTabBar({ pathname }: { pathname: string }) {
  const items = [
    { label: "Home", href: "/ceo", icon: Home },
    { label: "Work", href: "/ceo/work", icon: Building2 },
    { label: "＋", href: "/ceo/actions", icon: Plus, primary: true },
    { label: "Approvals", href: "/ceo/approvals", icon: CheckSquare },
    { label: "CEO", href: "/company", icon: UserRound },
  ];
  return (
    <nav
      aria-label="主要ナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-[#0b1020]/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                item.primary ? "text-white" : active ? "text-violet-300" : "text-slate-500"
              }`}
            >
              <span className={item.primary ? "-mt-4 rounded-full bg-violet-600 p-3 shadow-lg" : ""}><Icon className="h-5 w-5" aria-hidden /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
