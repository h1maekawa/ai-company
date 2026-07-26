"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Artifact = { kind: string; path: string; markdown: string };
type Status = {
  counts: { research: number; content: number; x: number };
  todayContent: number;
  files: { research: string[]; content: string[]; x: string[] };
  dirs: { research: string; content: string; x: string };
};

type Tab = "dashboard" | "workflow" | "drafts" | "knowledge";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "workflow", label: "Creator Workflow" },
  { id: "drafts", label: "Draft管理" },
  { id: "knowledge", label: "Knowledge Base" },
];

/** "2026-07-19-ai-agent.md" → { date, title } */
function parseFileName(name: string): { date: string; title: string } {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-(.*)\.md$/);
  if (!match) return { date: "", title: name.replace(/\.md$/, "") };
  return { date: match[1], title: match[2].replace(/-/g, " ") };
}

export default function NoteDepartmentPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<Status | null>(null);

  // Creator Workflow（/piro からそのまま移設）
  const [workflow, setWorkflow] = useState("full");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ファイルプレビュー
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refreshStatus = useCallback(() => {
    fetch("/api/piro/run")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setArtifacts([]);
    try {
      const response = await fetch("/api/piro/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow, topic, audience, context }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "実行に失敗しました");
      setArtifacts(data.artifacts || []);
      refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "実行に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(dir: string, name: string) {
    const path = `${dir}/${name}`;
    setPreviewLoading(true);
    setPreview({ path, content: "" });
    try {
      const response = await fetch(`/api/vault/${path}`);
      const data = await response.json();
      setPreview({ path, content: data.content || "(空のファイルです)" });
    } catch {
      setPreview({ path, content: "読み込みに失敗しました" });
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f1117] px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-emerald-400">NOTE事業部</p>
            <h1 className="mt-1 text-2xl font-bold">📝 Note事業部</h1>
            <p className="mt-2 text-sm text-slate-400">
              調査から記事・X投稿までを生成し、Knowledge Baseへ保存します。
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← AI Company
          </Link>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── Dashboard ─────────────────────────── */}
        {tab === "dashboard" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="今日の記事数" value={status ? String(status.todayContent) : "–"} accent="#34d399" />
              <StatCard label="下書き累計" value={status ? String(status.counts.content) : "–"} accent="#e2e8f0" />
              <StatCard label="Research" value={status ? String(status.counts.research) : "–"} accent="#38bdf8" />
              <StatCard label="X投稿案" value={status ? String(status.counts.x) : "–"} accent="#a78bfa" />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-bold">今月PV / 収益</h2>
              <p className="mt-2 text-sm text-slate-500">
                note Analytics との連携は未実装です（Phase 3）。実数が取れるまでは表示しません。
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="mb-3 text-sm font-bold">最近の下書き</h2>
              {status && status.files.content.length > 0 ? (
                <ul className="space-y-1.5">
                  {status.files.content.slice(0, 5).map((name) => {
                    const { date, title } = parseFileName(name);
                    return (
                      <li key={name}>
                        <button
                          onClick={() => {
                            setTab("drafts");
                            openFile(status.dirs.content, name);
                          }}
                          className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800"
                        >
                          <span className="shrink-0 text-xs text-slate-500">{date}</span>
                          <span className="truncate text-sm text-slate-300">{title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">まだ下書きがありません。</p>
              )}
            </div>

            <button
              onClick={() => setTab("workflow")}
              className="w-full rounded-xl bg-emerald-600 py-3 font-semibold hover:bg-emerald-500"
            >
              ✍️ Creator Workflowを実行する
            </button>
          </div>
        )}

        {/* ─── Creator Workflow（/piro から移設・UIそのまま） ─── */}
        {tab === "workflow" && (
          <div>
            <h2 className="mb-1 text-lg font-bold">Creator Workflow</h2>
            <p className="mb-5 text-sm text-slate-400">
              調査から記事・X投稿までを生成し、Knowledge Baseへ保存します。
            </p>

            {status && (
              <div className="mb-6 grid grid-cols-3 gap-3">
                {[
                  ["Research", status.counts.research],
                  ["Drafts", status.counts.content],
                  ["X Posts", status.counts.x],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{count}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div>
                <label className="text-xs text-slate-400">実行内容</label>
                <select
                  value={workflow}
                  onChange={(e) => setWorkflow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  <option value="full">Research → 記事 → X（フル実行）</option>
                  <option value="research">Researchのみ</option>
                  <option value="content">記事下書きのみ</option>
                  <option value="x">X投稿案のみ</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">テーマ *</label>
                <input
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例：AIエージェントで個人の仕事を自動化する方法"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">想定読者</label>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="空欄ならPiroのPrimary Targetを使用"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">前川さんの経験・前提・材料</label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={5}
                  placeholder="実体験や検証結果を入力すると、Piroらしい内容になります。"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </div>
              <button
                disabled={loading}
                className="w-full rounded-lg bg-emerald-600 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "AIチームが実行中…" : "ワークフローを実行"}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </form>

            <div className="mt-8 space-y-5">
              {artifacts.map((artifact) => (
                <section
                  key={artifact.path}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
                >
                  <div className="flex justify-between gap-4 border-b border-slate-800 px-4 py-3">
                    <span className="font-semibold capitalize">{artifact.kind}</span>
                    <span className="break-all text-xs text-emerald-400">保存: {artifact.path}</span>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap p-4 text-sm leading-6 text-slate-300">
                    {artifact.markdown}
                  </pre>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* ─── Draft管理 ─────────────────────────── */}
        {tab === "drafts" && (
          <FileBrowser
            title="Draft管理"
            description="生成された記事下書きの一覧です。公開予定・予約投稿の管理はPhase 3で追加します。"
            files={status?.files.content ?? []}
            dir={status?.dirs.content ?? ""}
            onOpen={openFile}
            preview={preview}
            previewLoading={previewLoading}
            onClose={() => setPreview(null)}
            emptyText="まだ下書きがありません。Creator Workflowで生成してください。"
          />
        )}

        {/* ─── Knowledge Base ───────────────────── */}
        {tab === "knowledge" && (
          <div className="space-y-6">
            <FileBrowser
              title="Research"
              description="調査データ。記事の材料として蓄積されます。"
              files={status?.files.research ?? []}
              dir={status?.dirs.research ?? ""}
              onOpen={openFile}
              preview={preview}
              previewLoading={previewLoading}
              onClose={() => setPreview(null)}
              emptyText="まだ調査データがありません。"
            />
            <FileBrowser
              title="X Posts"
              description="生成済みのX投稿案。"
              files={status?.files.x ?? []}
              dir={status?.dirs.x ?? ""}
              onOpen={openFile}
              preview={preview}
              previewLoading={previewLoading}
              onClose={() => setPreview(null)}
              emptyText="まだX投稿案がありません。"
            />
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function FileBrowser({
  title,
  description,
  files,
  dir,
  onOpen,
  preview,
  previewLoading,
  onClose,
  emptyText,
}: {
  title: string;
  description: string;
  files: string[];
  dir: string;
  onOpen: (dir: string, name: string) => void;
  preview: { path: string; content: string } | null;
  previewLoading: boolean;
  onClose: () => void;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>

      {files.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-800">
          {files.map((name) => {
            const { date, title: fileTitle } = parseFileName(name);
            const isOpen = preview?.path === `${dir}/${name}`;
            return (
              <li key={name}>
                <button
                  onClick={() => (isOpen ? onClose() : onOpen(dir, name))}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-800/50"
                >
                  <span className="shrink-0 text-xs text-slate-500">{date}</span>
                  <span className="flex-1 truncate text-sm text-slate-300">{fileTitle}</span>
                  <span className="shrink-0 text-xs text-slate-600">{isOpen ? "閉じる" : "開く"}</span>
                </button>
                {isOpen && (
                  <pre className="mb-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-6 text-slate-300">
                    {previewLoading ? "読み込み中…" : preview.content}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
