"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AtSign,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Menu,
  PenLine,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { ContentStudio } from "@/components/note/growth/ContentStudio";
import { IdeaInbox } from "@/components/note/IdeaInbox";
import { Composer } from "@/components/note/Composer";
import { ExperienceLibrary } from "@/components/note/ExperienceLibrary";
import { PublishQueue } from "@/components/note/PublishQueue";
import { ReferenceAccounts } from "@/components/note/ReferenceAccounts";
import { ContentToday } from "@/components/note/ContentToday";
import { ContentResults } from "@/components/note/ContentResults";
import { XWorkspace } from "@/components/note/x/XWorkspace";
import type { Idea } from "@/app/lib/note/types";
import { useBrand, useIdeas } from "./useNote";

/** 日常で使うのはこの4つだけ。設定は /note/settings へ分離している（作業と設定を混ぜない） */
type MainView = "today" | "create" | "review" | "results";
type MaterialView = "experiences" | "references" | "ideas" | "past-x" | "manual";

const MAIN_NAV = [
  { id: "today", label: "今日", icon: Sun, description: "コンテンツ事業の今の状況とやること" },
  { id: "create", label: "作る", icon: PenLine, description: "話題からX・noteの下書きを作成" },
  { id: "review", label: "確認", icon: CheckCircle2, description: "確認・修正・予約・公開" },
  { id: "results", label: "成果", icon: BarChart3, description: "投稿の結果・売上・学び" },
] as const;

/** 旧UIのタブ名から新タブへの読み替え（既存のDeep Linkを壊さない） */
const VIEW_ALIASES: Record<string, MainView> = {
  today: "today",
  create: "create",
  drafts: "review",
  review: "review",
  materials: "create",
  results: "results",
};

function NoteDepartment() {
  const searchParams = useSearchParams();
  const initialView = VIEW_ALIASES[searchParams.get("view") ?? ""] ?? "today";

  const [view, setView] = useState<MainView>(initialView);
  const [materialView, setMaterialView] = useState<MaterialView>("experiences");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [seed, setSeed] = useState<Idea | null>(null);

  const ideasState = useIdeas();
  const brandState = useBrand();

  function writeFrom(idea: Idea) {
    setSeed(idea);
    setMaterialsOpen(true);
    setMaterialView("manual");
  }

  const current = MAIN_NAV.find((item) => item.id === view) ?? MAIN_NAV[0];

  return (
    <main className="min-h-screen bg-ink-base px-3 py-5 text-white sm:px-6 sm:py-7">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gain">コンテンツ</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">
              {brandState.brand?.identity.name ?? "まえみち"} コンテンツスタジオ
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-sub sm:text-sm">
              話題を見つけ、自分の考えを加え、確認できる下書きにします。
            </p>
          </div>
          <Link
            href="/note/settings"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs text-sub hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            設定
          </Link>
        </header>

        <nav className="mb-4 grid grid-cols-4 gap-2">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
                className={`rounded-2xl border p-3 text-left transition-colors ${
                  view === item.id ? "border-brand bg-brand/10" : "border-hairline bg-ink-card hover:border-brand/40"
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

        {view === "today" && (
          <ContentToday onOpenReview={() => setView("review")} onOpenCreate={() => setView("create")} />
        )}

        {view === "create" && (
          <div className="space-y-4">
            <ContentStudio onOpenDrafts={() => setView("review")} />

            <section className="rounded-2xl border border-hairline bg-ink-card">
              <button
                type="button"
                onClick={() => setMaterialsOpen((open) => !open)}
                aria-expanded={materialsOpen}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">発信の材料</span>
                  <span className="mt-0.5 block text-[11px] text-sub">
                    自分の体験・参考アカウント・ネタ帳・過去の投稿から書く
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-sub transition-transform ${materialsOpen ? "rotate-180" : ""}`} />
              </button>

              {materialsOpen && (
                <div className="space-y-4 px-1 pb-1">
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
            </section>
          </div>
        )}

        {view === "review" && <PublishQueue />}
        {view === "results" && <ContentResults />}
      </div>
    </main>
  );
}

export default function NoteDepartmentPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-ink-base px-3 py-5 text-sub sm:px-6">読み込み中…</main>}
    >
      <NoteDepartment />
    </Suspense>
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
