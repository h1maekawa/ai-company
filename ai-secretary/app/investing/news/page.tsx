"use client";

import { InvestingShell } from "@/components/investing/Shell";
import { NewsPanel } from "@/components/investing/NewsPanel";
import { useNews } from "../usePortfolio";

export default function NewsPage() {
  const { items, available, loading } = useNews();

  return (
    <InvestingShell title="ニュース">
      <p className="mb-4 text-xs leading-relaxed text-sub">
        保有銘柄に関する配信済みの見出しを取得し、要約とセンチメントのみAIが付けています。
        記事本文や数値をAIが創作することはありません。
      </p>
      <NewsPanel items={items} available={available} loading={loading} />
    </InvestingShell>
  );
}
