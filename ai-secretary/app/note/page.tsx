"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AtSign,
  ArrowRight,
  BarChart3,
  BookOpen,
  Database,
  FileCheck2,
  Lightbulb,
  Menu,
  PenLine,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { ContentStudio } from "@/components/note/growth/ContentStudio";
import { GrowthInsights } from "@/components/note/growth/GrowthInsights";
import { IdeaInbox } from "@/components/note/IdeaInbox";
import { Composer } from "@/components/note/Composer";
import { AffiliateManager } from "@/components/note/AffiliateManager";
import { BrandEditor } from "@/components/note/BrandEditor";
import { LineProgram } from "@/components/note/LineProgram";
import { XAccounts } from "@/components/note/XAccounts";
import { ReferenceAccounts } from "@/components/note/ReferenceAccounts";
import { ExperienceLibrary } from "@/components/note/ExperienceLibrary";
import { PublishQueue } from "@/components/note/PublishQueue";
import { AutomationSettings } from "@/components/note/AutomationSettings";
import { XWorkspace } from "@/components/note/x/XWorkspace";
import type { Idea } from "@/app/lib/note/types";
import { useAffiliates, useBrand, useIdeas } from "./useNote";

type MainView = "create" | "drafts" | "materials" | "settings";
type MaterialView = "experiences" | "references" | "ideas" | "past-x" | "manual";
type SettingsView = "overview" | "brand" | "x" | "note" | "growth" | "safety" | "line";

const MAIN_NAV = [
  { id: "create", label: "投稿を作る", icon: PenLine, description: "話題からX・noteの下書きを作成" },
  { id: "drafts", label: "下書きを確認", icon: FileCheck2, description: "確認・修正・公開待ちを管理" },
  { id: "materials", label: "発信の材料", icon: Database, description: "体験・参考先・過去投稿・ネタ" },
  { id: "settings", label: "設定", icon: Settings, description: "ブランド・安全・アカウント" },
] as const;

export default function NoteDepartmentPage() {
  const [view, setView] = useState<MainView>("create");
  const [materialView, setMaterialView] = useState<MaterialView>("experiences");
  const [settingsView, setSettingsView] = useState<SettingsView>("overview");
  const [seed, setSeed] = useState<Idea | null>(null);

  const ideasState = useIdeas();
  const affiliateState = useAffiliates();
  const brandState = useBrand();

  function writeFrom(idea: Idea) {
    setSeed(idea);
    setMaterialView("manual");
  }

  const current = MAIN_NAV.find((item) => item.id === view) ?? MAIN_NAV[0];

  return (
    <main className="min-h-screen bg-ink-base px-3 py-5 text-white sm:px-6 sm:py-7">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">X・NOTE事業部</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">
              {brandState.brand?.identity.name ?? "まえみち"} コンテンツスタジオ
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-sub sm:text-sm">
              話題を見つけ、自分の考えを加え、確認できる下書きにします。
            </p>
          </div>
          <Link href="/" className="shrink-0 text-xs text-sub hover:text-white">← AI Company</Link>
        </header>

        <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`rounded-2xl border p-3 text-left transition-colors ${
                  view === item.id
                    ? "border-brand bg-brand/10"
                    : "border-hairline bg-ink-card hover:border-brand/40"
                }`}
              >
                <Icon className={`h-4 w-4 ${view === item.id ? "text-brand" : "text-sub"}`} />
                <p className="mt-2 text-sm font-semibold">{item.label}</p>
                <p className="mt-1 hidden text-[10px] leading-relaxed text-sub sm:block">{item.description}</p>
              </button>
            );
          })}
        </nav>

        <div className="mb-4 rounded-xl border border-hairline bg-white/[0.02] px-4 py-3">
          <p className="text-sm font-semibold">{current.label}</p>
          <p className="mt-0.5 text-[11px] text-sub">{current.description}</p>
        </div>

        {view === "create" && <ContentStudio onOpenDrafts={() => setView("drafts")} />}
        {view === "drafts" && <PublishQueue />}

        {view === "materials" && (
          <div className="space-y-4">
            <SubNavigation
              items={[
                ["experiences", "自分の体験", BookOpen],
                ["references", "参考アカウント", Users],
                ["ideas", "ネタ帳", Lightbulb],
                ["past-x", "過去X・参考投稿", AtSign],
                ["manual", "メモから書く", PenLine],
              ]}
              active={materialView}
              onChange={(id) => setMaterialView(id as MaterialView)}
            />
            {materialView === "experiences" && <ExperienceLibrary />}
            {materialView === "references" && <ReferenceAccounts />}
            {materialView === "past-x" && (
              <XWorkspace accounts={brandState.xAccounts} onOpenLocalEditor={() => setMaterialView("manual")} />
            )}
            {materialView === "ideas" && (
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
            {materialView === "manual" && (
              <Composer genres={ideasState.genres} seed={seed} onUsed={() => setSeed(null)} />
            )}
          </div>
        )}

        {view === "settings" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[11px] leading-relaxed text-amber-100">
              高度な設定です。普段の投稿作成では変更する必要はありません。
            </div>
            <SettingsNavigation
              active={settingsView}
              onChange={setSettingsView}
            />
            {settingsView === "overview" && (
              <div className="grid gap-3 md:grid-cols-2">
                <ChannelFlow
                  icon={AtSign}
                  title="Xの全体動線"
                  description="話題を見つけて、自分の意見を加え、本人確認後にX公式画面へ渡します。"
                  steps={["話題・検索条件", "3種類の下書き", "本人が確認", "X公式画面で投稿", "結果を記録"]}
                  action="Xの設定を見る"
                  onAction={() => setSettingsView("x")}
                />
                <ChannelFlow
                  icon={BookOpen}
                  title="noteの全体動線"
                  description="テーマから記事を作り、下書き保存後に内容・価格を本人が確認します。"
                  steps={["テーマ・本人の意見", "無料／有料構成", "下書き保存", "本人が確認", "noteへ反映"]}
                  action="noteの設定を見る"
                  onAction={() => setSettingsView("note")}
                />
                <ChannelFlow
                  icon={ShieldCheck}
                  title="共通の安全動線"
                  description="どの媒体も、ブランド規則・類似チェック・公開停止設定を通ります。"
                  steps={["ブランド確認", "体験・事実確認", "コピー防止", "承認待ち", "公開"]}
                  action="安全設定を見る"
                  onAction={() => setSettingsView("safety")}
                />
                <ChannelFlow
                  icon={Smartphone}
                  title="公式LINEの全体動線"
                  description="noteなどで関心を持った読者へ、段階的に案内するための設定です。"
                  steps={["記事・投稿", "LINEへ案内", "登録", "配信", "次の行動"]}
                  action="LINE設定を見る"
                  onAction={() => setSettingsView("line")}
                />
              </div>
            )}
            {settingsView === "brand" && (
              <>
                <SettingIntro title="全媒体共通のブランド" text="X・note・LINEの文章すべてに使う、まえみちの発信軸・読者・文体です。" />
                <BrandEditor
                  brand={brandState.brand}
                  loading={brandState.loading}
                  saving={brandState.saving}
                  error={brandState.error}
                  onSave={(brand) => brandState.save({ brand })}
                />
              </>
            )}
            {settingsView === "x" && (
              <>
                <ChannelFlow
                  icon={AtSign}
                  title="Xの設定が使われる場所"
                  description="ここで設定したアカウントと役割は、投稿作成時の振り分けと下書き生成に使われます。投稿確定は本人が行います。"
                  steps={["ジャンルを選択", "投稿先アカウントを決定", "下書きを生成", "本人確認", "X Web Intent"]}
                />
                <XAccounts
                  genres={ideasState.genres}
                  accounts={brandState.xAccounts}
                  loading={brandState.loading}
                  saving={brandState.saving}
                  error={brandState.error}
                  onSave={(xAccounts) => brandState.save({ xAccounts })}
                />
              </>
            )}
            {settingsView === "note" && (
              <>
                <ChannelFlow
                  icon={BookOpen}
                  title="noteの設定が使われる場所"
                  description="記事はまずAI会社へ下書き保存されます。有料範囲・価格・公開内容は必ず本人が確認します。"
                  steps={["記事を生成", "AI会社へ保存", "内容を確認", "note下書きへ反映", "本人が公開"]}
                />
                <SettingIntro title="note・収益リンク" text="実際に紹介してよい登録済みリンクだけを管理します。未登録URLは生成後に除去されます。" />
                <AffiliateManager
                  genres={ideasState.genres}
                  links={affiliateState.links}
                  loading={affiliateState.loading}
                  saving={affiliateState.saving}
                  error={affiliateState.error}
                  onSave={affiliateState.save}
                />
              </>
            )}
            {settingsView === "growth" && <GrowthInsights />}
            {settingsView === "safety" && (
              <>
                <ChannelFlow
                  icon={ShieldCheck}
                  title="安全・自動化設定が使われる場所"
                  description="X・note共通の最後の安全装置です。上位の投稿全体設定がOFFなら、個別設定に関係なく公開しません。"
                  steps={["下書き生成", "類似・事実確認", "本人承認", "公開設定を確認", "投稿先へ渡す"]}
                />
                <AutomationSettings />
              </>
            )}
            {settingsView === "line" && (
              <>
                <ChannelFlow
                  icon={Smartphone}
                  title="公式LINEの設定が使われる場所"
                  description="Xやnoteから来た読者へ、登録後に届ける内容と順番を管理します。"
                  steps={["X・note", "LINE登録", "ステップ配信", "記事・サービス案内", "反応を確認"]}
                />
                <LineProgram
                  program={brandState.program}
                  channels={brandState.channels}
                  loading={brandState.loading}
                  saving={brandState.saving}
                  error={brandState.error}
                  onSave={(program) => brandState.save({ program })}
                  onGenerate={brandState.generateLesson}
                />
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const SETTINGS_NAV = [
  ["overview", "全体", Workflow, "媒体ごとの流れ"],
  ["x", "X", AtSign, "アカウントと役割"],
  ["note", "note", BookOpen, "記事と収益リンク"],
  ["brand", "ブランド", Sparkles, "全媒体共通"],
  ["growth", "分析・収益", BarChart3, "投稿結果と条件"],
  ["safety", "安全", ShieldCheck, "公開・自動化"],
  ["line", "LINE", Smartphone, "登録後の配信"],
] as const;

function SettingsNavigation({ active, onChange }: { active: SettingsView; onChange: (id: SettingsView) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-hairline bg-ink-card p-2 sm:grid-cols-3">
      {SETTINGS_NAV.map(([id, label, Icon, description]) => (
        <button key={id} onClick={() => onChange(id)} className={`rounded-xl border p-3 text-left ${active === id ? "border-brand bg-brand/10" : "border-transparent bg-white/[0.02]"}`}>
          <Icon className={`h-4 w-4 ${active === id ? "text-brand" : "text-sub"}`} />
          <p className="mt-1.5 text-xs font-semibold">{label}</p>
          <p className="mt-0.5 text-[10px] text-sub">{description}</p>
        </button>
      ))}
    </div>
  );
}

function ChannelFlow({
  icon: Icon,
  title,
  description,
  steps,
  action,
  onAction,
}: {
  icon: typeof Menu;
  title: string;
  description: string;
  steps: string[];
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-brand/10 p-2 text-brand"><Icon className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[11px] leading-relaxed text-sub">{description}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-1.5">
            <span className="rounded-lg border border-hairline bg-white/[0.03] px-2 py-1.5 text-[10px] text-slate-200">{step}</span>
            {index < steps.length - 1 && <ArrowRight className="h-3 w-3 text-sub" />}
          </div>
        ))}
      </div>
      {action && onAction && <button onClick={onAction} className="mt-4 text-xs font-semibold text-brand-light">{action} →</button>}
    </section>
  );
}

function SettingIntro({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-sub">{text}</p></div>;
}

function SubNavigation({
  items,
  active,
  onChange,
}: {
  items: readonly (readonly [string, string, typeof Menu])[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-hairline bg-ink-card p-2">
      {items.map(([id, label, Icon]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${
            active === id ? "bg-white/10 font-semibold text-white" : "text-sub"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
