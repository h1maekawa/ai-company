"use client";

import { useEffect, useState } from "react";

type Learning = { id: string; period: string; observation: string; interpretation: string; actionCandidate?: string; status: string };
type Recommendation = { id: string; topic: string; channel: string; reason: string; status: string };
type WeeklyReview = { summary: { publishedCount: number; revenue: number; conversionCount: number; needsMoreData: boolean } };

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function LearningsPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [observation, setObservation] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [action, setAction] = useState("");

  const load = () => {
    fetch("/api/content/weekly-review").then((r) => r.json()).then(setReview);
    fetch("/api/content/learnings").then((r) => r.json()).then((d) => setLearnings(d.learnings ?? []));
    fetch("/api/content/recommendations").then((r) => r.json()).then((d) => setRecommendations(d.recommendations ?? []));
  };
  useEffect(load, []);

  async function addLearning() {
    if (!observation || !interpretation) return;
    await api("/api/content/learnings", "POST", { observation, interpretation, actionCandidate: action || undefined });
    setObservation("");
    setInterpretation("");
    setAction("");
    load();
  }

  async function decide(id: string, decision: "approve" | "reject") {
    await api("/api/content/learnings", "PATCH", { id, decision });
    load();
  }

  async function generateRecommendations() {
    await api("/api/content/recommendations", "POST", { action: "generate" });
    load();
  }

  async function adopt(id: string) {
    const { session } = await api(`/api/content/recommendations/${id}/convert`, "POST");
    window.location.href = `/content/note`;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">LEARNINGS</h2>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">WEEKLY REVIEW</p>
        {!review && <p className="mt-2 text-xs text-sub">読み込み中…</p>}
        {review?.summary.needsMoreData && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-sub">データ不足</p>}
        {review && !review.summary.needsMoreData && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-sub">今週投稿</p><p className="font-semibold">{review.summary.publishedCount}</p></div>
            <div><p className="text-sub">Revenue</p><p className="font-semibold">¥{review.summary.revenue.toLocaleString()}</p></div>
            <div><p className="text-sub">Conversions</p><p className="font-semibold">{review.summary.conversionCount}</p></div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">Learning候補を追加</p>
        <p className="mt-1 text-[11px] text-sub">Observation（観測事実）とInterpretation（解釈）は分けて書きます。</p>
        <textarea value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observation（例: 体験型X投稿3件はHow-toよりLink CTRが高かった）" rows={2} className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs" />
        <textarea value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="Interpretation（例: 具体的な本人経験の方が関心を得やすい可能性）" rows={2} className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs" />
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action候補（任意）" className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
        <button onClick={addLearning} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold">追加（candidateとして保存）</button>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">Learning一覧</p>
        <div className="mt-2 space-y-2">
          {learnings.length === 0 && <p className="text-xs text-sub">まだありません。</p>}
          {learnings.map((l) => (
            <div key={l.id} className="rounded-lg border border-hairline bg-white/[0.02] p-3 text-xs">
              <p><b>Observation:</b> {l.observation}</p>
              <p className="mt-1"><b>Interpretation:</b> {l.interpretation}</p>
              {l.actionCandidate && <p className="mt-1"><b>Action:</b> {l.actionCandidate}</p>}
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[9px] ${l.status === "approved" ? "bg-gain/20 text-gain" : "bg-white/5 text-sub"}`}>{l.status}</span>
                {l.status === "candidate" && (
                  <>
                    <button onClick={() => decide(l.id, "approve")} className="rounded bg-gain/20 px-2 py-1 text-gain">承認</button>
                    <button onClick={() => decide(l.id, "reject")} className="rounded bg-white/5 px-2 py-1">却下</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">NEXT CONTENT</p>
          <button onClick={generateRecommendations} className="rounded-lg border border-hairline px-3 py-1.5 text-xs">承認済みLearningから提案を作る</button>
        </div>
        <div className="mt-2 space-y-2">
          {recommendations.filter((r) => r.status === "suggested").length === 0 && <p className="text-xs text-sub">提案はまだありません。</p>}
          {recommendations.filter((r) => r.status === "suggested").map((r) => (
            <div key={r.id} className="rounded-lg border border-hairline bg-white/[0.02] p-3 text-xs">
              <p className="font-semibold">{r.topic}</p>
              <p className="mt-1 text-sub">理由: {r.reason}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => adopt(r.id)} className="rounded bg-brand px-2 py-1 font-semibold">採用</button>
                <button onClick={() => api("/api/content/recommendations", "PATCH", { id: r.id, status: "rejected" }).then(load)} className="rounded bg-white/5 px-2 py-1">見送る</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
