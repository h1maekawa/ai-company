"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { InvestingShell } from "@/components/investing/Shell";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";
import type { WatchTheme } from "@/app/lib/investing/watchlist";

export default function WatchlistPage() {
  const [themes, setThemes] = useState<WatchTheme[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/investing/watchlist")
      .then((r) => r.json())
      .then((json: { themes?: WatchTheme[]; updatedAt?: string | null }) => {
        setThemes(json.themes ?? []);
        setUpdatedAt(json.updatedAt ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <InvestingShell title="ウォッチリスト">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : themes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star className="h-7 w-7" />}
            title="監視銘柄がありません"
            description="Vaultの memory/personal/fund/watchlist.md にテーマ別の表を書くと、ここに一覧で表示されます。"
          />
        </Card>
      ) : (
        <>
          {updatedAt && (
            <p className="mb-4 text-[11px] text-sub">最終更新 {updatedAt}</p>
          )}
          <div className="space-y-4">
            {themes.map((theme, index) => (
              <Card key={theme.theme} padded={false} delay={index * 0.04}>
                <div className="px-5 pt-5">
                  <CardHeader title={theme.theme} hint={`${theme.items.length}銘柄`} />
                </div>
                <ul className="divide-y divide-hairline/60">
                  {theme.items.map((item) => (
                    <li
                      key={`${theme.theme}-${item.ticker}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <Link
                        href={`/investing/holdings/${encodeURIComponent(item.ticker)}`}
                        className="min-w-0 flex-1"
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">{item.name}</span>
                          <Badge>{item.ticker}</Badge>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-sub">
                          {item.reason}
                        </span>
                      </Link>
                      <span className="shrink-0 text-xs text-sub">{item.market}</span>
                      {item.status && (
                        <span className="shrink-0 text-xs text-slate-300">{item.status}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </InvestingShell>
  );
}
