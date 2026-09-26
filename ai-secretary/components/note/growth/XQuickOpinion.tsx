"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ResearchItem, SocialDraft, TrendCluster } from "@/app/lib/note/research/types";

type Candidate = TrendCluster & { items: ResearchItem[] };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function confidence(value?: TrendCluster["hotConfidence"]): number {
  return value === "HIGH" ? 2 : value === "MEDIUM" ? 1 : 0;
}

export function XQuickOpinion({ onOpenDrafts }: { onOpenDrafts: () => void }) {
  const params = useSearchParams();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<{ clusterId: string; sourceItemId: string } | null>(null);
  const [personalAngle, setPersonalAngle] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ draft: SocialDraft; dueAt?: string } | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const ranked = useMemo(() => candidates
    .filter((cluster) => cluster.status === "candidate" && !cluster.blocked)
    .sort((a, b) => confidence(b.hotConfidence) - confidence(a.hotConfidence) || (b.hotScore ?? -1) - (a.hotScore ?? -1) || b.lastDetectedAt.localeCompare(a.lastDetectedAt) || b.totalScore - a.totalScore)
    .slice(0, 5), [candidates]);

  async function loadCandidates() {
    const response = await fetch("/api/note/research/candidates");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "候補の読み込みに失敗しました");
    setCandidates(data.clusters ?? []);
  }

  useEffect(() => { void loadCandidates().catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (selected || ranked.length === 0) return;
    const clusterId = params.get("clusterId");
    const sourceItemId = params.get("sourceItemId");
    const target = ranked.find((cluster) => cluster.id === clusterId);
    const validSource = target?.items.find((item) => item.id === sourceItemId && target.researchItemIds.includes(item.id));
    const fallback = ranked[0];
    const fallbackSource = fallback.items[0];
    if (target && validSource) setSelected({ clusterId: target.id, sourceItemId: validSource.id });
    else if (fallbackSource) setSelected({ clusterId: fallback.id, sourceItemId: fallbackSource.id });
  }, [params, ranked, selected]);

  const selectedCluster = ranked.find((cluster) => cluster.id === selected?.clusterId);
  const selectedSource = selectedCluster?.items.find((item) => item.id === selected?.sourceItemId);
  const SpeechRecognition = typeof window === "undefined" ? undefined : ((window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition);

  function speak() {
    if (!SpeechRecognition || listening) return;
    const instance = new SpeechRecognition();
    instance.lang = "ja-JP";
    instance.continuous = false;
    instance.interimResults = true;
    const original = personalAngle;
    instance.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      setPersonalAngle([original, transcript].filter(Boolean).join(original ? " " : ""));
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => { setListening(false); setError("音声入力に失敗しました。テキストで編集できます。"); };
    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  async function refresh() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/note/research/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "x" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelected(null);
      await loadCandidates();
    } catch (e) { setError(e instanceof Error ? e.message : "更新に失敗しました"); } finally { setBusy(false); }
  }

  async function schedule() {
    if (!selected || !personalAngle.trim() || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const generated = await fetch("/api/note/content/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clusterId: selected.clusterId, sourceItemId: selected.sourceItemId, personalAngle: personalAngle.trim(), kind: "x", variantMode: "opinion-only" }) });
      const generatedData = await generated.json();
      if (!generated.ok) throw new Error(generatedData.error);
      const draft = generatedData.xDrafts?.[0] as SocialDraft | undefined;
      if (!draft) throw new Error(generatedData.xWarning ?? "X投稿案を作成できませんでした");
      const queued = await fetch("/api/note/publishing/buffer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, mode: "addToQueue", idempotencyKey: `quick-x:${draft.id}` }) });
      const queuedData = await queued.json();
      if (!queued.ok) throw new Error(`投稿案は保存しましたが、予約できませんでした。\n${queuedData.error ?? "Bufferエラー"}\n確認画面から再度操作できます。`);
      setResult({ draft, dueAt: queuedData.post?.dueAt });
    } catch (e) { setError(e instanceof Error ? e.message : "予約に失敗しました"); } finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-brand/50 bg-ink-card p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-[.18em] text-gain">QUICK X</p><h2 className="mt-1 text-lg font-bold">X クイック投稿</h2><p className="mt-1 text-xs text-sub">記事を読んで、自分の意見を入れるだけで次の枠へ予約します。</p></div><button disabled={busy} onClick={() => void refresh()} className="rounded-lg border border-hairline px-3 py-2 text-xs disabled:opacity-50">最新の話題に更新</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {ranked.map((cluster) => <article key={cluster.id} className={`rounded-xl border p-3 ${selected?.clusterId === cluster.id ? "border-brand bg-brand/10" : "border-hairline"}`}><button className="w-full text-left" onClick={() => cluster.items[0] && setSelected({ clusterId: cluster.id, sourceItemId: cluster.items[0].id })}><p className="font-semibold">{cluster.title}</p><p className="mt-1 text-xs text-sub">Hot Score {cluster.hotScore ?? cluster.totalScore} / {cluster.hotConfidence ?? "-"} / ソース{cluster.sourceCount}件</p><p className="mt-2 text-xs leading-relaxed text-sub">{cluster.summary}</p></button>{cluster.items.map((item) => <label key={item.id} className="mt-2 flex items-start gap-2 text-xs"><input type="radio" checked={selected?.sourceItemId === item.id} onChange={() => setSelected({ clusterId: cluster.id, sourceItemId: item.id })}/><span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline" onClick={(event) => event.stopPropagation()}>{item.title ?? "記事を開く"}</a>{item.authorName ? ` / ${item.authorName}` : ""}{item.platform ? ` / ${item.platform}` : ""}{item.publishedAt ? ` / ${new Date(item.publishedAt).toLocaleDateString("ja-JP")}` : ""}<span className="mt-1 block text-sub">{item.textExcerpt}</span></span></label>)}</article>)}
    </div>
    {selectedSource && <div className="mt-5"><label className="text-sm font-semibold" htmlFor="quick-x-opinion">この記事についてどう思う？</label><textarea id="quick-x-opinion" value={personalAngle} onChange={(event) => setPersonalAngle(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-hairline bg-ink-base p-3 text-sm" placeholder="30秒くらい、自分の言葉で話すか書いてください。"/><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!SpeechRecognition || listening} onClick={speak} className="rounded-lg border border-hairline px-3 py-2 text-xs disabled:opacity-50">{listening ? "聞いています…" : "🎙 話す"}</button><button type="button" disabled={busy || !personalAngle.trim()} onClick={() => void schedule()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "処理中…" : "この意見でXに予約"}</button></div>{!SpeechRecognition && <p className="mt-2 text-xs text-sub">このブラウザでは音声入力を利用できません。テキストで入力してください。</p>}</div>}
    {error && <div className="mt-4 whitespace-pre-line rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}<div className="mt-2"><button onClick={onOpenDrafts} className="underline">確認画面へ</button></div></div>}
    {result && <div className="mt-4 rounded-xl border border-gain/40 bg-gain/10 p-4"><p className="font-semibold">✅ Xに予約しました</p>{result.dueAt && <p className="mt-2 text-sm">予定: {new Date(result.dueAt).toLocaleString("ja-JP")}</p>}<p className="mt-2 whitespace-pre-wrap text-sm">投稿: {result.draft.text}</p><p className="mt-2 text-xs">元記事: <a href={selectedSource?.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{selectedSource?.title ?? selectedSource?.sourceUrl}</a></p><button onClick={onOpenDrafts} className="mt-3 text-sm underline">確認画面へ</button></div>}
  </section>;
}
