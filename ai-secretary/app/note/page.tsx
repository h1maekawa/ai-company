"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AtSign,
  BookOpen,
  Lightbulb,
  Link2,
  PenLine,
  Search,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Target,
  Users,
  PanelTop,
} from "lucide-react";
import { IdeaInbox } from "@/components/note/IdeaInbox";
import { Composer } from "@/components/note/Composer";
import { AffiliateManager } from "@/components/note/AffiliateManager";
import { BrandEditor } from "@/components/note/BrandEditor";
import { LineProgram } from "@/components/note/LineProgram";
import { XAccounts } from "@/components/note/XAccounts";
import { ResearchPanel, ResearchSummaryCard } from "@/components/note/ResearchPanel";
import { ReferenceAccounts } from "@/components/note/ReferenceAccounts";
import { ExperienceLibrary } from "@/components/note/ExperienceLibrary";
import { PublishQueue } from "@/components/note/PublishQueue";
import { AutomationSettings } from "@/components/note/AutomationSettings";
import { XWorkspace } from "@/components/note/x/XWorkspace";
import { Card, CardHeader } from "@/components/ui/primitives";
import type { Idea } from "@/app/lib/note/types";
import { useAffiliates, useBrand, useIdeas } from "./useNote";

type Tab =
  | "dashboard"
  | "research"
  | "references"
  | "experiences"
  | "queue"
  | "settings"
  | "ideas"
  | "write"
  | "x"
  | "line"
  | "affiliate"
  | "brand"
  | "x-workspace";

const TABS: { id: Tab; label: string; icon: typeof Lightbulb }[] = [
  { id: "dashboard", label: "ダッシュボード", icon: Target },
  { id: "research", label: "リサーチ候補", icon: Search },
  { id: "references", label: "参考アカウント", icon: Users },
  { id: "experiences", label: "体験ライブラリ", icon: BookOpen },
  { id: "queue", label: "投稿キュー", icon: Send },
  { id: "settings", label: "自動化設定", icon: Settings },
  { id: "ideas", label: "ネタ帳", icon: Lightbulb },
  { id: "write", label: "記事を作る", icon: PenLine },
  { id: "x-workspace", label: "Xワークスペース", icon: PanelTop },
  { id: "x", label: "Xアカウント", icon: AtSign },
  { id: "line", label: "公式LINE", icon: Smartphone },
  { id: "affiliate", label: "アフィリエイト", icon: Link2 },
  { id: "brand", label: "ブランディング", icon: Sparkles },
];

export default function NoteDepartmentPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [seed, setSeed] = useState<Idea | null>(null);

  const ideasState = useIdeas();
  const affiliateState = useAffiliates();
  const brandState = useBrand();

  const inboxCount = ideasState.ideas.filter((i) => i.status === "inbox").length;
  const readyLinks = affiliateState.links.filter((l) => l.active && l.url).length;
  const lessonsWritten = brandState.program?.steps.filter((s) => s.content).length ?? 0;
  const lessonsTotal = brandState.program?.steps.length ?? 0;
  const credibilityMissing = (brandState.brand?.credibility.length ?? 0) === 0;
  const assignedGenreIds = new Set(brandState.xAccounts.flatMap((a) => a.genreIds));
  const unassignedGenres = ideasState.genres.filter((g) => !assignedGenreIds.has(g.id));

  function writeFrom(idea: Idea) {
    setSeed(idea);
    setTab("write");
  }

  return (
    <main className="min-h-screen bg-ink-base px-4 py-7 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-gain">NOTE事業部</p>
            <h1 className="mt-1 text-2xl font-bold">{brandState.brand?.identity.name ?? "まえみち"}</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              {brandState.brand?.identity.primaryTagline ?? "人生を、ちょっと豊かに。"}
            </p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-sub">
              AI・副業・読書・資産形成・習慣。
              実際に試して学んだことから、毎日を少し豊かにするヒントを発信します。
            </p>
          </div>
          <Link href="/" className="text-sm text-sub hover:text-white">
            ← AI Company
          </Link>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-ink-card p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-gain text-ink-base" : "text-sub hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ─── ダッシュボード ───────────────────── */}
        {tab === "dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="ネタの在庫" value={`${inboxCount}件`} accent="#f59e0b" />
              <Stat
                label="使えるリンク"
                value={`${readyLinks}件`}
                accent={readyLinks > 0 ? "#22c55e" : "#94A3B8"}
              />
              <Stat label="LINE配信文" value={`${lessonsWritten}/${lessonsTotal}`} accent="#4f8cff" />
              <Stat label="ネタ総数" value={`${ideasState.ideas.length}件`} accent="#e2e8f0" />
            </div>

            {credibilityMissing && (
              <Card>
                <CardHeader title="最初にやること" />
                <p className="text-sm leading-relaxed text-slate-300">
                  ブランディングの
                  <span className="mx-1 font-semibold text-white">「語れる根拠（実体験・実績）」</span>
                  がまだ空です。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-sub">
                  ここが空の間、AIは収益額や成果を一切書きません（根拠のない実績を書かせないためです）。
                  実際にやったこと・数字を入れるほど、記事とLINE配信の説得力が上がります。
                </p>
                <button
                  onClick={() => setTab("brand")}
                  className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85"
                >
                  ブランディングを編集する
                </button>
              </Card>
            )}

            {!brandState.loading && unassignedGenres.length > 0 && (
              <Card>
                <CardHeader title="Xアカウントの割り当てが未完了です" />
                <p className="text-sm leading-relaxed text-slate-300">
                  次のジャンルがまだどちらのXアカウントにも割り当てられていません:{" "}
                  <span className="font-semibold text-white">
                    {unassignedGenres.map((g) => g.label).join("、")}
                  </span>
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-sub">
                  割り当てるまで、このジャンルの記事を作ってもX投稿案がどちらのアカウント向けか決まりません。
                </p>
                <button
                  onClick={() => setTab("x")}
                  className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand/85"
                >
                  Xアカウントを設定する
                </button>
              </Card>
            )}

            <Card>
              <CardHeader title="収益までの流れ" hint="どこで集めて、どこで教えて、どこで収益化するか" />
              <ol className="space-y-2">
                {(brandState.brand?.funnel ?? []).map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-sub">
                      {i + 1}
                    </span>
                    <span className="text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              <ResearchSummaryCard onOpen={() => setTab("research")} />
              <button
                onClick={() => setTab("experiences")}
                className="rounded-2xl border border-hairline bg-ink-card p-4 text-left transition-colors hover:border-gain/40"
              >
                <p className="text-sm font-semibold text-white">📗 体験ライブラリ</p>
                <p className="mt-1 text-[11px] text-sub">
                  実際にやったことを貯めるほど、記事もX投稿も具体的になります
                </p>
              </button>
              <button
                onClick={() => setTab("ideas")}
                className="rounded-2xl border border-hairline bg-ink-card p-4 text-left transition-colors hover:border-brand/40"
              >
                <p className="text-sm font-semibold text-white">💡 朝会からネタを拾う</p>
                <p className="mt-1 text-[11px] text-sub">
                  実際に終わらせたタスクから、記事になりそうなものをAIが選びます
                </p>
              </button>
              <button
                onClick={() => setTab("line")}
                className="rounded-2xl border border-hairline bg-ink-card p-4 text-left transition-colors hover:border-gain/40"
              >
                <p className="text-sm font-semibold text-white">🎓 公式LINEの教材を作る</p>
                <p className="mt-1 text-[11px] text-sub">
                  {brandState.program?.name ?? "プログラム"}の配信文を1回ずつ作れます
                </p>
              </button>
            </div>
          </div>
        )}

        {tab === "research" && <ResearchPanel />}
        {tab === "references" && <ReferenceAccounts />}
        {tab === "experiences" && <ExperienceLibrary />}
        {tab === "queue" && <PublishQueue />}
        {tab === "settings" && <AutomationSettings />}
        {tab === "x-workspace" && <XWorkspace accounts={brandState.xAccounts} />}

        {tab === "ideas" && (
          <IdeaInbox
            genres={ideasState.genres}
            ideas={ideasState.ideas}
            loading={ideasState.loading}
            busy={ideasState.busy}
            error={ideasState.error}
            notice={ideasState.notice}
            onHarvest={ideasState.harvest}
            onAdd={ideasState.addIdea}
            onSave={ideasState.saveIdeas}
            onWrite={writeFrom}
          />
        )}

        {tab === "write" && (
          <Composer genres={ideasState.genres} seed={seed} onUsed={() => setSeed(null)} />
        )}

        {tab === "x" && (
          <XAccounts
            genres={ideasState.genres}
            accounts={brandState.xAccounts}
            loading={brandState.loading}
            saving={brandState.saving}
            error={brandState.error}
            onSave={(xAccounts) => brandState.save({ xAccounts })}
          />
        )}

        {tab === "line" && (
          <LineProgram
            program={brandState.program}
            channels={brandState.channels}
            loading={brandState.loading}
            saving={brandState.saving}
            error={brandState.error}
            onSave={(program) => brandState.save({ program })}
            onGenerate={brandState.generateLesson}
          />
        )}

        {tab === "affiliate" && (
          <AffiliateManager
            genres={ideasState.genres}
            links={affiliateState.links}
            loading={affiliateState.loading}
            saving={affiliateState.saving}
            error={affiliateState.error}
            onSave={affiliateState.save}
          />
        )}

        {tab === "brand" && (
          <BrandEditor
            brand={brandState.brand}
            loading={brandState.loading}
            saving={brandState.saving}
            error={brandState.error}
            onSave={(brand) => brandState.save({ brand })}
          />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-4">
      <p className="text-[11px] text-sub">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
