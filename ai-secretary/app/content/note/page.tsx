"use client";

import { useEffect, useState } from "react";
import { Database, MessageSquare, PenLine, Rss, Sparkles } from "lucide-react";
import { NoteStudioChat } from "./NoteStudioChat";

type Session = { id: string; title: string; stage: string; updatedAt: string };
type Material = { id: string; title: string; sourceType: string; status: string };
type ProviderStatus = { id: string; label: string; available: boolean };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function NoteStudioPage() {
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [themeInput, setThemeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/content/sessions").then((r) => r.json()).then((d) => setSessions(d.sessions ?? []));
    fetch("/api/content/materials").then((r) => r.json()).then((d) => setMaterials(d.materials ?? []));
    fetch("/api/content/providers").then((r) => r.json()).then((d) => setProviders(d.providers ?? []));
  };

  useEffect(load, []);

  async function startSession(title: string) {
    setBusy(true);
    setError(null);
    try {
      const { session } = await post("/api/content/sessions", { title });
      setActiveSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  async function startFromMaterial(materialId: string, title: string) {
    setBusy(true);
    try {
      const { session } = await post("/api/content/sessions", { title, materialIds: [materialId] });
      setActiveSession(session.id);
    } finally {
      setBusy(false);
    }
  }

  if (activeSession) {
    return (
      <NoteStudioChat
        sessionId={activeSession}
        onBack={() => {
          setActiveSession(null);
          load();
        }}
      />
    );
  }

  const timebox = providers.find((p) => p.id === "timebox");
  const drafts = sessions.filter((s) => ["DRAFT", "REVIEW"].includes(s.stage));
  const queued = sessions.filter((s) => s.stage === "APPROVED");
  const recentlyPublished = sessions.filter((s) => s.stage === "PUBLISHED").slice(0, 5);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold">NOTE STUDIO</h2>
        <p className="mt-1 text-sm text-sub">今日は何を書きますか？</p>
        {timebox?.available && (
          <p className="mt-2 inline-block rounded-full border border-gain/30 bg-gain/10 px-3 py-1 text-[10px] text-gain">
            Timebox接続中（完了タスクを材料に使えます）
          </p>
        )}
        {error && <p className="mt-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <ActionCard icon={MessageSquare} label="AIと話しながら作る" description="自由に話しながら記事の形にしていきます" onClick={() => startSession("新しい記事")} disabled={busy} />
        <div className="rounded-2xl border border-hairline bg-ink-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><PenLine className="h-4 w-4 text-brand" />自分でテーマを入れる</div>
          <textarea
            value={themeInput}
            onChange={(e) => setThemeInput(e.target.value)}
            placeholder="今考えていることをそのまま書いてください（Timeboxは使いません）"
            rows={3}
            className="w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs"
          />
          <button
            onClick={() => themeInput.trim() && startSession(themeInput.trim().slice(0, 40))}
            disabled={busy || !themeInput.trim()}
            className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40"
          >
            AIと話しながら整理する
          </button>
        </div>
        <ActionCard icon={Database} label="発信材料から作る" description="Material一覧から選んで始めます" onClick={() => document.getElementById("materials-list")?.scrollIntoView({ behavior: "smooth" })} />
        <ActionCard icon={Rss} label="Researchから作る" description="Research Content Providerから始めます" onClick={() => (window.location.href = "/content/research")} />
      </section>

      <SessionList title="下書き" sessions={drafts} onOpen={setActiveSession} empty="下書きはまだありません" />
      <SessionList title="公開待ち（承認済み）" sessions={queued} onOpen={setActiveSession} empty="公開待ちはまだありません" />
      <SessionList title="最近公開" sessions={recentlyPublished} onOpen={setActiveSession} empty="まだ公開したものはありません" />

      <section id="materials-list" className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">発信材料（Material）</p>
        <div className="mt-3 space-y-2">
          {materials.length === 0 && <p className="text-xs text-sub">まだありません。「自分でテーマを入れる」から作れます。</p>}
          {materials.slice(0, 15).map((m) => (
            <button
              key={m.id}
              onClick={() => startFromMaterial(m.id, m.title)}
              className="flex w-full items-center justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-left text-xs hover:border-brand/40"
            >
              <span>
                <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{m.sourceType}</span>
                {m.title}
              </span>
              <Sparkles className="h-3.5 w-3.5 text-sub" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: typeof MessageSquare;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-2xl border border-hairline bg-ink-card p-4 text-left hover:border-brand/40 disabled:opacity-50">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-brand" />{label}</div>
      <p className="text-xs text-sub">{description}</p>
    </button>
  );
}

function SessionList({ title, sessions, onOpen, empty }: { title: string; sessions: Session[]; onOpen: (id: string) => void; empty: string }) {
  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 space-y-1.5">
        {sessions.length === 0 && <p className="text-xs text-sub">{empty}</p>}
        {sessions.map((s) => (
          <button key={s.id} onClick={() => onOpen(s.id)} className="flex w-full items-center justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-left text-xs hover:border-brand/40">
            <span>{s.title}</span>
            <span className="text-sub">{s.stage}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
