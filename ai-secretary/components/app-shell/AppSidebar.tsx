"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV, PRIMARY_NAV, isNavActive, type AppNavItem } from "@/app/lib/config/navigation";

/**
 * トップレベルの入口。日常は PRIMARY_NAV、管理系は「管理」1つに畳む。
 * ナビ定義は app/lib/config/navigation.ts が唯一の正。
 */
export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-[#0b1020] px-3 py-5">
      <Link href="/" onClick={onNavigate} className="mb-6 px-3">
        <p className="text-base font-bold text-white">AI Company</p>
        <p className="mt-0.5 text-[11px] text-slate-500">あなたのAI事業部</p>
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.id} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="mt-auto pt-6">
          <div className="mb-3 border-t border-slate-800/80" />
          <SidebarLink item={ADMIN_NAV} pathname={pathname} onNavigate={onNavigate} />
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: AppNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
        active
          ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}
