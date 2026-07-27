"use client";

import { ExternalLink, Newspaper } from "lucide-react";
import { NewsItem } from "@/app/lib/investing/types";
import { Card, CardHeader, EmptyState, SentimentBadge, Skeleton } from "./ui";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

export function NewsPanel({
  items,
  available,
  loading,
  limit,
}: {
  items: NewsItem[];
  available: boolean;
  loading: boolean;
  limit?: number;
}) {
  const rows = limit ? items.slice(0, limit) : items;

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader
          title="最新ニュース"
          hint={available ? "見出しは配信元から取得し、要約のみAIが作成しています" : undefined}
        />
      </div>

      {loading ? (
        <div className="space-y-3 px-5 pb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Newspaper className="h-7 w-7" />}
            title="ニュースを取得できませんでした"
            description="配信元のフィードに接続できていません。実際に配信された見出しだけを扱う方針のため、ここでは内容を生成しません。"
          />
        </div>
      ) : (
        <ul className="divide-y divide-hairline/60">
          {rows.map((item) => (
            <li key={item.id}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-white group-hover:text-brand">
                      {item.title}
                    </p>
                    <SentimentBadge sentiment={item.sentiment} />
                  </div>

                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-sub">
                      {item.summary}
                    </p>
                  )}

                  <p className="mt-1.5 flex items-center gap-2 text-[11px] text-sub">
                    <span>{relativeTime(item.publishedAt)}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{item.source}</span>
                    {item.tickers.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-brand">{item.tickers.join(", ")}</span>
                      </>
                    )}
                    <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
