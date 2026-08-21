"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Database,
  Gauge,
  GraduationCap,
  Home,
  Megaphone,
  Rss,
  Settings,
  Tag,
  Wallet,
} from "lucide-react";

const NAV = [
  { href: "/content", label: "Home", icon: Home },
  { href: "/content/note", label: "Note", icon: BookOpen },
  { href: "/content/x", label: "X", icon: Megaphone },
  { href: "/content/materials", label: "Materials", icon: Database },
  { href: "/content/research", label: "Research", icon: Rss },
  { href: "/content/offers", label: "Offers", icon: Tag },
  { href: "/content/performance", label: "Performance", icon: Gauge },
  { href: "/content/revenue", label: "Revenue", icon: Wallet },
  { href: "/content/learnings", label: "Learnings", icon: GraduationCap },
  { href: "/content/published", label: "Published", icon: BarChart3 },
  { href: "/content/settings", label: "Settings", icon: Settings },
] as const;

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-ink-base text-white">
      <header className="border-b border-hairline px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">CONTENT BUSINESS OS</p>
              <h1 className="mt-1 text-lg font-bold sm:text-xl">投稿 → 集客 → 販売 → 売上 → 学習 → 次の投稿</h1>
            </div>
            <Link href="/" className="shrink-0 text-xs text-sub hover:text-white">← AI Company</Link>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto pb-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== "/content" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-7">{children}</main>
    </div>
  );
}
