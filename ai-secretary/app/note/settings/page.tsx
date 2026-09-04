"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { AutomationSettings } from "@/components/note/AutomationSettings";
import { AffiliateManager } from "@/components/note/AffiliateManager";
import { BrandEditor } from "@/components/note/BrandEditor";
import { LineProgram } from "@/components/note/LineProgram";
import { XAccounts } from "@/components/note/XAccounts";
import { GrowthInsights } from "@/components/note/growth/GrowthInsights";
import { GrowthInsights as OperationsGrowthInsights } from "@/components/note/GrowthInsights";
import { useAffiliates, useBrand, useIdeas } from "../useNote";

/**
 * コンテンツ設定。作業画面（/note）とは分けて、ここだけで設定が完結するようにする。
 *
 * 並びは「よく触る順」: 基本設定 → ブランド → 接続 → 詳細設定。
 * 詳細設定は普段開かない（X Account・収益リンク・LINE・分析）。
 */
type SettingsSection = "basic" | "brand" | "connections" | "advanced";

const SECTIONS: { id: SettingsSection; label: string; description: string }[] = [
  { id: "basic", label: "基本設定", description: "運用モード・リサーチ・投稿上限・noteの動作" },
  { id: "brand", label: "ブランド", description: "発信軸・読者・文体・避けたい表現" },
  { id: "connections", label: "接続", description: "Buffer・SerpAPI・投資データの接続状況" },
  { id: "advanced", label: "詳細設定", description: "Xアカウント・収益リンク・LINE・分析" },
];

export default function ContentSettingsPage() {
  const [section, setSection] = useState<SettingsSection>("basic");
  const ideasState = useIdeas();
  const affiliateState = useAffiliates();
  const brandState = useBrand();

  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <main className="min-h-screen bg-ink-base px-3 py-5 text-white sm:px-6 sm:py-7">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">コンテンツ設定</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">運用ルールを決める</h1>
            <p className="mt-1 text-xs leading-relaxed text-sub sm:text-sm">
              普段の投稿作成では変更する必要はありません。
            </p>
          </div>
          <Link
            href="/note"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-sub hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            コンテンツへ戻る
          </Link>
        </header>

        <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              className={`rounded-2xl border p-3 text-left transition-colors ${
                section === item.id ? "border-brand bg-brand/10" : "border-hairline bg-ink-card hover:border-brand/40"
              }`}
            >
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-1 hidden text-[10px] leading-relaxed text-sub sm:block">{item.description}</p>
            </button>
          ))}
        </nav>

        <div className="mb-4 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3">
          <p className="text-sm font-semibold">{current.label}</p>
          <p className="mt-0.5 text-[11px] text-sub">{current.description}</p>
        </div>

        {section === "basic" && <AutomationSettings />}

        {section === "brand" && (
          <BrandEditor
            brand={brandState.brand}
            loading={brandState.loading}
            saving={brandState.saving}
            error={brandState.error}
            onSave={(brand) => brandState.save({ brand })}
          />
        )}

        {section === "connections" && <ContentConnections />}

        {section === "advanced" && (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[11px] leading-relaxed text-amber-100">
              高度な設定です。設定を変えても、投稿の最終確認は必ず前川さんが行います。
            </p>

            <Advanced title="Xアカウント" hint="ジャンルごとの投稿先と役割">
              <XAccounts
                genres={ideasState.genres}
                accounts={brandState.xAccounts}
                loading={brandState.loading}
                saving={brandState.saving}
                error={brandState.error}
                onSave={(xAccounts) => brandState.save({ xAccounts })}
              />
            </Advanced>

            <Advanced title="収益リンク" hint="紹介してよい登録済みリンクだけを管理します">
              <AffiliateManager
                genres={ideasState.genres}
                links={affiliateState.links}
                loading={affiliateState.loading}
                saving={affiliateState.saving}
                error={affiliateState.error}
                onSave={affiliateState.save}
              />
            </Advanced>

            <Advanced title="公式LINE" hint="登録後に届ける内容と順番">
              <LineProgram
                program={brandState.program}
                channels={brandState.channels}
                loading={brandState.loading}
                saving={brandState.saving}
                error={brandState.error}
                onSave={(program) => brandState.save({ program })}
                onGenerate={brandState.generateLesson}
              />
            </Advanced>

            <Advanced title="分析・成長条件" hint="どんな投稿が伸びたかの内部指標">
              <div className="space-y-4">
                <GrowthInsights />
                <OperationsGrowthInsights />
              </div>
            </Advanced>
          </div>
        )}
      </div>
    </main>
  );
}

function Advanced({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-hairline bg-ink-card">
      <summary className="cursor-pointer list-none px-5 py-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-[11px] text-sub">{hint}</p>
      </summary>
      <div className="px-1 pb-1">{children}</div>
    </details>
  );
}

type AutomationStatus = {
  buffer: { configured: boolean };
  serpApi: { configured: boolean };
  investing: { portfolioAvailable: boolean; newsAvailable: boolean };
  performanceSync: { lastRunAt: string | null };
};

/** 接続は「つながっているか」だけを見せる。値の設定はVercelの環境変数側で行う */
function ContentConnections() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/note/automation/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-48 rounded-2xl" />;

  const rows = [
    { label: "Buffer（X投稿の予約）", ok: status?.buffer.configured ?? false, hint: "未設定でも下書き保存はできます" },
    { label: "SerpAPI（話題のリサーチ）", ok: status?.serpApi.configured ?? false, hint: "未設定ならリサーチは自動でスキップします" },
    { label: "投資データ（保有状況）", ok: status?.investing.portfolioAvailable ?? false, hint: "投資の話題を書くときに使います" },
    { label: "投資ニュース", ok: status?.investing.newsAvailable ?? false, hint: "投資の話題を書くときに使います" },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="外部サービスの接続" hint="つながっていなくても、下書き作成と本人確認は使えます" />
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm">{row.label}</span>
                <span className="block text-[10px] text-sub">{row.hint}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${row.ok ? "text-gain" : "text-sub"}`}>
                {row.ok ? "接続済み" : "未設定"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-sub">
          投稿結果の取得:{" "}
          {status?.performanceSync.lastRunAt
            ? `最終実行 ${new Date(status.performanceSync.lastRunAt).toLocaleString("ja-JP")}`
            : "未実行"}
        </p>
      </Card>

      <Link
        href="/connections"
        className="flex items-center justify-center rounded-2xl border border-hairline bg-ink-card px-4 py-3 text-sm text-sub hover:text-white"
      >
        AI Company全体の接続状態を見る →
      </Link>
    </div>
  );
}
