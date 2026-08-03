"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AtSign,
  BookOpen,
  Database,
  FileCheck2,
  Lightbulb,
  Link2,
  Menu,
  PenLine,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { ContentStudio } from "@/components/note/growth/ContentStudio";
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
type SettingsView = "brand" | "x-account" | "safety" | "affiliate" | "line";

const MAIN_NAV = [
  { id: "create", label: "投稿を作る", icon: PenLine, description: "話題からX・noteの下書きを作成" },
  { id: "drafts", label: "下書きを確認", icon: FileCheck2, description: "確認・修正・公開待ちを管理" },
  { id: "materials", label: "発信の材料", icon: Database, description: "体験・参考先・過去投稿・ネタ" },
  { id: "settings", label: "設定", icon: Settings, description: "ブランド・安全・アカウント" },
] as const;

export default function NoteDepartmentPage() {
  const [view, setView] = useState<MainView>("create");
  const [materialView, setMaterialView] = useState<MaterialView>("experiences");
  const [settingsView, setSettingsView] = useState<SettingsView>("brand");
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
            <SubNavigation
              items={[
                ["brand", "発信ルール", Sparkles],
                ["x-account", "Xアカウント", AtSign],
                ["safety", "安全・自動化", ShieldCheck],
                ["affiliate", "収益リンク", Link2],
                ["line", "公式LINE", Smartphone],
              ]}
              active={settingsView}
              onChange={(id) => setSettingsView(id as SettingsView)}
            />
            {settingsView === "brand" && (
              <BrandEditor
                brand={brandState.brand}
                loading={brandState.loading}
                saving={brandState.saving}
                error={brandState.error}
                onSave={(brand) => brandState.save({ brand })}
              />
            )}
            {settingsView === "x-account" && (
              <XAccounts
                genres={ideasState.genres}
                accounts={brandState.xAccounts}
                loading={brandState.loading}
                saving={brandState.saving}
                error={brandState.error}
                onSave={(xAccounts) => brandState.save({ xAccounts })}
              />
            )}
            {settingsView === "safety" && <AutomationSettings />}
            {settingsView === "affiliate" && (
              <AffiliateManager
                genres={ideasState.genres}
                links={affiliateState.links}
                loading={affiliateState.loading}
                saving={affiliateState.saving}
                error={affiliateState.error}
                onSave={affiliateState.save}
              />
            )}
            {settingsView === "line" && (
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
          </div>
        )}
      </div>
    </main>
  );
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
