"use client";

import { useEffect, useState } from "react";

type Draft = {
  id: string;
  text: string;
  status: string;
  draftType?: string;
  materialIds?: string[];
  sourceNoteArticleId?: string;
  createdAt: string;
};
type Material = { id: string; title: string; sourceType: string };

const DRAFT_TYPES = ["opinion", "experience", "learning", "how-to", "hook", "note-traffic", "product-traffic"];

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function XStudioPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [draftType, setDraftType] = useState("opinion");
  const [manualText, setManualText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/content/x/drafts").then((r) => r.json()).then((d) => setDrafts(d.drafts ?? []));
    fetch("/api/content/materials").then((r) => r.json()).then((d) => setMaterials(d.materials ?? []));
  };
  useEffect(load, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/content/x/drafts", "POST", { materialId: materialId || undefined, draftType, manualText: manualText || undefined });
      setManualText("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function publish(draft: Draft) {
    const url = window.prompt("公開したXのURL（任意）") ?? "";
    await api("/api/content/published", "POST", { channel: "x", contentId: draft.id, title: draft.text.slice(0, 40), url: url || undefined });
    await api("/api/content/x/drafts", "PATCH", { id: draft.id, status: "published" });
    load();
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold">X STUDIO</h2>
        <p className="mt-1 text-sm text-sub">Noteが無くてもXだけで、Material → Draft → Review → Published → Performance まで完結します。</p>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">新しいX下書き</p>
        {error && <p className="mt-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
            <option value="">Materialを使わない（手動入力のみ）</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
          <select value={draftType} onChange={(e) => setDraftType(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
            {DRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="手動で投稿文を書く場合はここに（空ならMaterialからAIが生成します）"
          rows={3}
          className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs"
        />
        <button onClick={create} disabled={busy || (!materialId && !manualText.trim())} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">
          下書きを作る
        </button>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">下書き一覧</p>
        <div className="mt-2 space-y-2">
          {drafts.length === 0 && <p className="text-xs text-sub">まだありません。</p>}
          {drafts.map((d) => (
            <div key={d.id} className="rounded-lg border border-hairline bg-white/[0.02] p-3 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{d.draftType ?? "—"} / {d.status}</span>
                {d.sourceNoteArticleId && <span className="text-[9px] text-sub">note記事から生成</span>}
              </div>
              <p className="whitespace-pre-wrap">{d.text}</p>
              {d.status !== "published" && (
                <button onClick={() => publish(d)} className="mt-2 rounded-lg bg-gain/20 px-3 py-1.5 text-gain">公開記録を作成</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
