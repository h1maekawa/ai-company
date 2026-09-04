"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ADMIN_NAV, PRIMARY_NAV, isNavActive } from "@/app/lib/config/navigation";
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

/** モバイルは主要5領域を下部タブに常時出す（メニューを開かなくても移動できる） */
function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="主要ナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-[#0b1020]/95 backdrop-blur lg:hidden"
    >
      <div className="flex">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                active ? "text-violet-300" : "text-slate-500"
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link
          href={ADMIN_NAV.href}
          aria-current={isNavActive(pathname, ADMIN_NAV.href) ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
            isNavActive(pathname, ADMIN_NAV.href) ? "text-violet-300" : "text-slate-500"
          }`}
        >
          <span className="text-base leading-none" aria-hidden>
            {ADMIN_NAV.icon}
          </span>
          <span>{ADMIN_NAV.label}</span>
        </Link>
      </div>
    </nav>
  );
}
