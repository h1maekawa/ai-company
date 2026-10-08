"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Camera,
  ChevronLeft,
  Database,
  Gauge,
  GraduationCap,
  Home,
  Megaphone,
  Rss,
  ListChecks,
  Settings,
  Tag,
  Wallet,
} from "lucide-react";

/**
 * SNS事業のPrimary Navigationと既存Advanced routeを同じ枠で提供する。
 * 既存routeはすべて維持し、Deep Linkとブックマークを壊さない。
 */
const NAV_GROUPS = [
  {
    label: "SNSコンテンツ",
    items: [
      { href: "/content", label: "概要", icon: Home },
      { href: "/content/x", label: "X", icon: Megaphone },
      { href: "/content/instagram", label: "Instagram", icon: Camera },
      { href: "/content/note", label: "Note", icon: BookOpen },
    ],
  },
  {
    label: "詳細・Advanced",
    items: [
      { href: "/content/performance", label: "投稿結果", icon: Gauge },
      { href: "/content/revenue", label: "売上", icon: Wallet },
      { href: "/content/learnings", label: "学び", icon: GraduationCap },
      { href: "/content/published", label: "公開済み", icon: BarChart3 },
      { href: "/content/materials", label: "素材", icon: Database },
      { href: "/content/research", label: "リサーチ", icon: Rss },
      { href: "/content/offers", label: "販売するもの", icon: Tag },
      { href: "/content/settings", label: "詳細設定", icon: Settings },
    ],
  },
] as const;

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-ink-base text-white">
      <header className="border-b border-hairline px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">SNS BUSINESS OS</p>
              <h1 className="mt-1 text-lg font-bold sm:text-xl">SNSコンテンツ</h1>
            </div>
            <Link href="/" className="flex shrink-0 items-center gap-1 text-xs text-sub hover:text-white">
              <ChevronLeft className="h-3.5 w-3.5" />
              Homeへ戻る
            </Link>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sub/70">{group.label}</p>
              <nav className="flex gap-1 overflow-x-auto pb-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href || (item.href !== "/content" && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active ? "bg-brand/15 text-brand" : "text-sub hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-7">{children}</main>
    </div>
  );
}
