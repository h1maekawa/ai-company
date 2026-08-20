"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/* ─── 型（APIレスポンスに対応） ───────────────────────────────── */

type GrillOption = { index: number; label: string; description: string; isRecommended: boolean };

type GrillNode = {
  id: string;
  title: string;
  question: string;
  dependsOn: string[];
  status: "blocked" | "frontier" | "answered";
  options?: GrillOption[];
  recommendation: string;
  recommendationReason: string;
  answer?: string;
};

type SharedUnderstanding = {
  summary: string;
  majorDecisions: { decision: string; reason: string }[];
  rejectedAlternatives: { alternative: string; reason: string }[];
  risks: string[];
  remainingAssumptions: string[];
  implementationScope: string[];
};

type Session = {
  id: string;
  topic: string;
  status: "active" | "ready_for_confirmation" | "confirmed" | "cancelled";
  designTree: GrillNode[];
  currentFrontier: string[];
  round: number;
  facts: { id: string; statement: string; source: string }[];
  sharedUnderstanding?: SharedUnderstanding;
  durability: "durable" | "volatile";
};

type View = {
  session: Session;
  currentQuestions: GrillNode[];
  durabilityWarning?: string;
  factProvidersUsed?: string[];
  captured?: { ok: boolean; path?: string; status?: string; error?: string };
};

type SessionSummary = {
  id: string;
  topic: string;
  status: string;
  round: number;
  answeredCount: number;
  totalCount: number;
  updatedAt: string;
};

/* ─── 本体 ──────────────────────────────────────────────────── */

function GrillInner() {
  const params = useSearchParams();
  const initialTopic = params.get("topic") ?? "";

  const [topic, setTopic] = useState(initialTopic);
  const [view, setView] = useState<View | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reviseText, setReviseText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/grill/sessions");
      const json = await res.json();
      if (res.ok) setSessions(json.items ?? []);
    } catch {
      /* 一覧取得の失敗は致命ではない */
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const call = async (url: string, body: unknown, okMsg?: string) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "処理に失敗しました");
      setView(json as View);
      setDrafts({});
      if (okMsg) setFlash(okMsg);
      await loadSessions();
      return json as View;
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const resume = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grill/sessions?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "再開に失敗しました");
      setView(json as View);
      setDrafts({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "再開に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const s = view?.session;
  const answered = s?.designTree.filter((n) => n.status === "answered").length ?? 0;
  const total = s?.designTree.length ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Grilling — 壁打ちで設計を詰める</h1>
            <p className="mt-1 text-xs text-slate-400">
              論点を分解し、答えられるものからまとめて質問します。
              合意（Shared Understanding）をあなたが承認するまで、実装には進みません。
            </p>
          </div>
          <Link href="/" className="shrink-0 text-xs text-blue-400 hover:underline">
            ホームへ
          </Link>
        </div>

        {flash && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {flash}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}
        {view?.durabilityWarning && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            ⚠️ {view.durabilityWarning}
          </p>
        )}

        {/* ─── 開始 / 再開 ─────────────────────────────── */}
        {!s && (
          <>
            <section className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold">新しく壁打ちを始める</h2>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例: note事業の来月の伸ばし方 / 投資部門の再設計"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <button
                  disabled={busy || !topic.trim()}
                  onClick={() => call("/api/grill/start", { topic: topic.trim() })}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {busy ? "準備中..." : "Grilling開始"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                開始時に、調べれば分かること（過去のKnowledge・Vault・実装状況）はAIが自分で調査します。
              </p>
            </section>

            {sessions.length > 0 && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="mb-2 text-sm font-semibold">中断中のセッション</h2>
                <ul className="space-y-2">
                  {sessions.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 border-b border-slate-800/60 pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{x.topic}</p>
                        <p className="text-[10px] text-slate-500">
                          {x.status} · Round {x.round} · {x.answeredCount}/{x.totalCount} 論点
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() => resume(x.id)}
                        className="shrink-0 rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800 disabled:opacity-40"
                      >
                        再開
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* ─── セッション表示 ───────────────────────────── */}
        {s && (
          <>
            <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{s.topic}</h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Round {s.round} ・ 回答済み {answered}/{total} ・ 残りFrontier {s.currentFrontier.length}
                    {s.durability === "volatile" && <span className="ml-2 text-amber-300">(再開保証なし)</span>}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setView(null);
                    setTopic("");
                  }}
                  className="shrink-0 text-[11px] text-slate-400 hover:text-slate-200"
                >
                  一覧へ戻る
                </button>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: total ? `${(answered / total) * 100}%` : "0%" }}
                />
              </div>
              {view?.factProvidersUsed && view.factProvidersUsed.length > 0 && (
                <p className="mt-2 text-[10px] text-slate-500">
                  調査済み: {view.factProvidersUsed.join(" / ")}（{s.facts.length}件の前提を取得）
                </p>
              )}
            </section>

            {/* 調査済み前提 */}
            {s.facts.length > 0 && (
              <details className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <summary className="cursor-pointer text-xs text-slate-300">
                  AIが調査済みの前提（{s.facts.length}件） — これらは質問しません
                </summary>
                <ul className="mt-2 space-y-1">
                  {s.facts.map((f) => (
                    <li key={f.id} className="text-[11px] text-slate-400">
                      ・{f.statement} <span className="text-slate-600">［{f.source}］</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* 質問（Frontier） */}
            {s.status === "active" && view && view.currentQuestions.length > 0 && (
              <>
                <div className="space-y-4">
                  {view.currentQuestions.map((n, i) => (
                    <section key={n.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <h3 className="text-sm font-semibold text-slate-100">
                        ❓ Q{i + 1} — {n.title}
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                        {n.question}
                      </p>

                      {n.options && n.options.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {n.options.map((o) => {
                            const selected = drafts[n.id] === o.label;
                            return (
                              <button
                                key={o.index}
                                onClick={() => setDrafts((d) => ({ ...d, [n.id]: o.label }))}
                                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                  selected
                                    ? "border-blue-500 bg-blue-500/15 text-white"
                                    : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                                }`}
                              >
                                <span className="font-semibold">
                                  {o.index}. {o.label}
                                  {o.isRecommended && <span className="ml-2 text-emerald-400">推奨</span>}
                                </span>
                                {o.description && (
                                  <span className="mt-0.5 block text-[11px] text-slate-400">{o.description}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <p className="mt-2 text-[11px] text-emerald-300">
                        ➡️ 推奨: {n.recommendation}
                        {n.recommendationReason && (
                          <span className="block text-slate-500">理由: {n.recommendationReason}</span>
                        )}
                      </p>

                      <input
                        value={drafts[n.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
                        placeholder="自由記述で答える / 上の選択肢を押す"
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => setDrafts((d) => ({ ...d, [n.id]: n.recommendation }))}
                        className="mt-1.5 text-[11px] text-blue-400 hover:underline"
                      >
                        推奨をそのまま採用
                      </button>
                    </section>
                  ))}
                </div>

                <button
                  disabled={busy || Object.values(drafts).filter((v) => v.trim()).length === 0}
                  onClick={() => call("/api/grill/answer", { sessionId: s.id, answers: drafts })}
                  className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {busy ? "処理中..." : "この内容で回答して次へ"}
                </button>
              </>
            )}

            {/* Shared Understanding 確認 */}
            {s.status === "ready_for_confirmation" && s.sharedUnderstanding && (
              <section className="rounded-xl border border-emerald-500/40 bg-slate-900 p-4">
                <h3 className="text-sm font-semibold text-emerald-300">Shared Understanding（合意内容）</h3>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                  {s.sharedUnderstanding.summary}
                </p>

                <Block title="決定事項">
                  {s.sharedUnderstanding.majorDecisions.map((d, i) => (
                    <li key={i} className="text-[11px] text-slate-300">
                      <span className="font-semibold">{d.decision}</span>
                      <span className="block text-slate-500">理由: {d.reason}</span>
                    </li>
                  ))}
                </Block>
                <Block title="採用しなかった案">
                  {s.sharedUnderstanding.rejectedAlternatives.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-300">
                      {r.alternative}
                      <span className="block text-slate-500">理由: {r.reason}</span>
                    </li>
                  ))}
                </Block>
                <Block title="リスク">
                  {s.sharedUnderstanding.risks.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-300">{r}</li>
                  ))}
                </Block>
                <Block title="未確定の前提">
                  {s.sharedUnderstanding.remainingAssumptions.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-300">{r}</li>
                  ))}
                </Block>
                <Block title="実装スコープ">
                  {s.sharedUnderstanding.implementationScope.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-300">{r}</li>
                  ))}
                </Block>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const v = await call("/api/grill/confirm", { sessionId: s.id });
                      if (v?.captured?.ok) {
                        setFlash(`承認しました。Knowledge候補としてInboxに保存 → ${v.captured.path}（/weekly-review で昇格できます）`);
                      } else if (v) {
                        setFlash("承認しました。（Knowledge候補の保存はスキップされました）");
                      }
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    承認する
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => call("/api/grill/cancel", { sessionId: s.id }, "セッションを破棄しました")}
                    className="rounded-lg border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    破棄する
                  </button>
                </div>

                <div className="mt-4 border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-400">修正して再Grillする（追加で詰めたいこと）</p>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reviseText}
                      onChange={(e) => setReviseText(e.target.value)}
                      placeholder="例: 費用対効果の観点が抜けている"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                    />
                    <button
                      disabled={busy || !reviseText.trim()}
                      onClick={async () => {
                        await call("/api/grill/revise", { sessionId: s.id, request: reviseText.trim() });
                        setReviseText("");
                      }}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 disabled:opacity-40"
                    >
                      再Grill
                    </button>
                  </div>
                </div>
              </section>
            )}

            {(s.status === "confirmed" || s.status === "cancelled") && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm text-slate-200">
                  このセッションは <span className="font-semibold">{s.status}</span> です。
                </p>
                {s.status === "confirmed" && (
                  <Link href="/weekly-review" className="mt-2 inline-block text-xs text-blue-400 hover:underline">
                    /weekly-review でKnowledge昇格を確認する →
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  if (arr.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold text-slate-400">{title}</p>
      <ul className="mt-1 list-inside list-disc space-y-1">{children}</ul>
    </div>
  );
}

export default function GrillPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 p-6 text-slate-400">読み込み中...</main>}>
      <GrillInner />
    </Suspense>
  );
}
