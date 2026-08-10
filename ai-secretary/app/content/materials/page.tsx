"use client";

import { useEffect, useState } from "react";

type Material = { id: string; title: string; sourceType: string; status: string; rawContent: string };

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [available, setAvailable] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/content/materials")
      .then((r) => r.json())
      .then((d) => {
        setMaterials(d.materials ?? []);
        setAvailable(d.available ?? []);
      });
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    try {
      await api("/api/content/materials", "POST", { action: "manual", title, rawContent: content });
      setTitle("");
      setContent("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">MATERIALS</h2>
      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">手動で追加</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトル" className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="内容" rows={3} className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs" />
        <button onClick={create} disabled={busy || !content.trim()} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">追加</button>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">保存済みMaterial（{materials.length}件）</p>
        <div className="mt-2 space-y-1.5">
          {materials.map((m) => (
            <div key={m.id} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{m.sourceType}</span>
              {m.title}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">全Providerから見える候補（未取り込み含む）</p>
        <div className="mt-2 space-y-1.5">
          {available.length === 0 && <p className="text-xs text-sub">候補はありません（Provider未接続でも空表示になるだけで壊れません）。</p>}
          {available.slice(0, 20).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <span><span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{m.sourceType}</span>{m.title}</span>
              <button
                onClick={() => api("/api/content/materials", "POST", { action: "import", providerId: m.sourceType, id: m.id }).then(load)}
                className="rounded bg-brand/20 px-2 py-1 text-[10px] text-brand"
              >
                取り込む
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
