"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Artifact = { kind: string; path: string; markdown: string };
type Status = { counts: { research: number; content: number; x: number } };

export default function PiroPage() {
  const [workflow, setWorkflow] = useState("full");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = () => {
    fetch("/api/piro/run").then((r) => r.json()).then(setStatus).catch(() => undefined);
  };

  useEffect(refreshStatus, []);

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

  return (
    <main className="min-h-screen bg-[#0f1117] text-slate-100 px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-emerald-400 text-xs font-semibold tracking-widest">PIRO CREATOR OS</p>
            <h1 className="text-2xl font-bold mt-1">Creator Workflow</h1>
            <p className="text-slate-400 text-sm mt-2">調査から記事・X投稿までを生成し、Knowledge Baseへ保存します。</p>
          </div>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">← AI Company</Link>
        </div>

        {status && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[["Research", status.counts.research], ["Drafts", status.counts.content], ["X Posts", status.counts.x]].map(([label, count]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-bold mt-1">{count}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-400">実行内容</label>
            <select value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
              <option value="full">Research → 記事 → X（フル実行）</option>
              <option value="research">Researchのみ</option>
              <option value="content">記事下書きのみ</option>
              <option value="x">X投稿案のみ</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">テーマ *</label>
            <input required value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例：AIエージェントで個人の仕事を自動化する方法" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-slate-400">想定読者</label>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="空欄ならPiroのPrimary Targetを使用" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-slate-400">前川さんの経験・前提・材料</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={5} placeholder="実体験や検証結果を入力すると、Piroらしい内容になります。" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
          </div>
          <button disabled={loading} className="w-full rounded-lg bg-emerald-600 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50">
            {loading ? "AIチームが実行中…" : "ワークフローを実行"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        <div className="mt-8 space-y-5">
          {artifacts.map((artifact) => (
            <section key={artifact.path} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="flex justify-between gap-4 border-b border-slate-800 px-4 py-3">
                <span className="font-semibold capitalize">{artifact.kind}</span>
                <span className="text-xs text-emerald-400 break-all">保存: {artifact.path}</span>
              </div>
              <pre className="whitespace-pre-wrap p-4 text-sm leading-6 text-slate-300 overflow-x-auto">{artifact.markdown}</pre>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
