"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  AtSign,
  BookOpen,
  CircleHelp,
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

const TABS: { id: Tab; label: string; description: string; icon: typeof Lightbulb; group: "main" | "materials" | "settings" }[] = [
  { id: "dashboard", label: "ホーム", description: "今日やることを確認", icon: Target, group: "main" },
  { id: "research", label: "話題を探す", description: "X・noteの投稿テーマを探す", icon: Search, group: "main" },
  { id: "x-workspace", label: "X投稿を作る", description: "調べて、整えて、Xで投稿", icon: PanelTop, group: "main" },
  { id: "write", label: "noteを書く", description: "メモや候補から記事を作る", icon: PenLine, group: "main" },
  { id: "queue", label: "下書き・投稿", description: "作成済みの内容を確認", icon: Send, group: "main" },
  { id: "experiences", label: "自分の体験", description: "記事に使える実体験", icon: BookOpen, group: "materials" },
  { id: "references", label: "参考アカウント", description: "研究したい発信者", icon: Users, group: "materials" },
  { id: "ideas", label: "ネタ帳", description: "思いつきを保存", icon: Lightbulb, group: "materials" },
  { id: "brand", label: "発信ルール", description: "まえみちらしさを設定", icon: Sparkles, group: "materials" },
  { id: "x", label: "Xアカウント", description: "自分のアカウントを登録", icon: AtSign, group: "settings" },
  { id: "settings", label: "安全・自動化", description: "リサーチと公開の設定", icon: Settings, group: "settings" },
  { id: "line", label: "公式LINE", description: "LINE教材を作成", icon: Smartphone, group: "settings" },
  { id: "affiliate", label: "収益リンク", description: "紹介リンクを管理", icon: Link2, group: "settings" },
];

const GROUPS = [
  { id: "main", label: "よく使う" },
  { id: "materials", label: "発信の材料" },
  { id: "settings", label: "設定・その他" },
] as const;

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

        {/* Navigation */}
        <div className="mb-4 rounded-2xl border border-hairline bg-ink-card p-2 sm:p-3">
          {GROUPS.map((group) => (
            <div key={group.id} className="flex items-start gap-2 border-b border-hairline py-2 last:border-0">
              <p className="w-20 shrink-0 px-1 pt-2 text-[10px] font-semibold text-sub">{group.label}</p>
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                {TABS.filter((item) => item.group === group.id).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      title={item.description}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                        tab === item.id ? "bg-gain text-ink-base" : "text-sub hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {tab !== "dashboard" && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold">{TABS.find((item) => item.id === tab)?.label}</p>
              <p className="mt-0.5 text-xs text-sub">{TABS.find((item) => item.id === tab)?.description}</p>
            </div>
          </div>
        )}

        {/* ─── ダッシュボード ───────────────────── */}
        {tab === "dashboard" && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="まずは、この順番で進めます" hint="迷ったら左から順に押してください" />
              <div className="grid gap-2 sm:grid-cols-4">
                <GuideStep number="1" title="話題を探す" text="いま読まれそうなテーマを見つける" onClick={() => setTab("research")} />
                <GuideStep number="2" title="自分の体験を足す" text="AIが作り話をしないための材料" onClick={() => setTab("experiences")} />
                <GuideStep number="3" title="投稿を作る" text="Xまたはnoteの文章にする" onClick={() => setTab("x-workspace")} />
                <GuideStep number="4" title="自分で確認する" text="下書きを確認してから投稿する" onClick={() => setTab("queue")} />
              </div>
              <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-sub">
                「リサーチ」は、人気の話題をそのままコピーする機能ではありません。
                読まれている理由を見つけ、前川さん自身の体験や考えと組み合わせるための機能です。
              </p>
            </Card>

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
              <CardHeader title="この事業部でできること" hint="Xで知ってもらい、noteで詳しく伝え、収益につなげます" />
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
        {tab === "x-workspace" && <XWorkspace accounts={brandState.xAccounts} onOpenLocalEditor={() => setTab("write")} />}

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

function GuideStep({
  number,
  title,
  text,
  onClick,
}: {
  number: string;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-hairline bg-white/[0.02] p-3 text-left hover:border-gain/40"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gain/15 text-xs font-bold text-gain">{number}</span>
        <ArrowRight className="h-3.5 w-3.5 text-sub group-hover:text-gain" />
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-sub">{text}</p>
    </button>
  );
}
