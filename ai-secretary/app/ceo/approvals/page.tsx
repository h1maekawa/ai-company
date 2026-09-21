"use client";
import { useCallback, useEffect, useState } from "react";

type DraftCandidate = { id: string; contentType: "x" | "note"; title?: string; body: string; parentMissionId: string; sourceStepId: string; sourceKnowledgeIds: string[]; sourceResearchRefs: string[]; sourceKpiRefs: string[]; createdByAgentId: string; createdAt: string };
type Approval = { id: string; title?: string; actionType?: string; summary?: string; reason?: string; status?: string; riskLevel?: string; contentDraftCandidate?: DraftCandidate };
type Notice = { id: string; sourceType: string; sourceId: string; title: string; summary: string; priority: string; deepLink: string };
export default function CeoApprovalsPage() {
  const [items, setItems] = useState<Approval[] | null>(null); const [error, setError] = useState("");
  const [other, setOther] = useState<Array<{ label: string; count: number | null; href: string }>>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const load = useCallback(async () => { try {
    const requests = await Promise.allSettled([fetch("/api/company/approvals"), fetch("/api/content/candidates"), fetch("/api/knowledge/candidates"), fetch("/api/fund/learning"), fetch("/api/company/notifications")]);
    const read = async (index: number) => requests[index].status === "fulfilled" && requests[index].value.ok ? requests[index].value.json() : null;
    const [company, content, knowledge, fund, notification] = await Promise.all([read(0), read(1), read(2), read(3), read(4)]);
    if (!company) throw new Error();
    setItems(company.pending ?? []);
    setOther([
      { label: "Content候補", count: content ? (content.candidates ?? []).filter((item: { status?: string }) => item.status === "suggested").length : null, href: "/content/review" },
      { label: "Knowledge候補", count: knowledge && typeof knowledge.count === "number" ? knowledge.count : null, href: "/weekly-review" },
      { label: "Fund Learning", count: fund ? (fund.learnings ?? []).filter((item: { status?: string }) => item.status === "candidate").length : null, href: "/investing" },
    ]);
    setNotices((notification?.notifications ?? []).filter((item: Notice) => item.sourceType !== "approval").slice(0, 20));
    setError("");
  } catch { setError("承認一覧を取得できませんでした"); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(item: Approval, decision: "approve" | "reject") {
    if (!window.confirm(`${item.title ?? item.actionType ?? "この操作"}を${decision === "approve" ? "承認" : "却下"}しますか？`)) return;
    const response = await fetch(`/api/company/approvals/${encodeURIComponent(item.id)}/${decision}`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
    if (!response.ok) setError("判断を保存できませんでした"); else void load();
  }
  async function lightEdit(item: Approval) {
    const candidate = item.contentDraftCandidate; if (!candidate) return;
    const body = window.prompt("Draft本文を修正", candidate.body); if (body === null || body.trim() === candidate.body.trim()) return;
    const response = await fetch(`/api/company/content-draft-candidates/${encodeURIComponent(candidate.id)}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body }) });
    if (!response.ok) setError("Draftを修正できませんでした"); else void load();
  }
  return <main className="mx-auto max-w-3xl px-4 py-5"><h1 className="text-2xl font-bold">Approvals</h1><p className="mt-1 text-sm text-slate-400">既存Approval SSOTを横断表示します。承認は実行権限の拡張を意味しません。</p>
    {error && <button onClick={() => void load()} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-4">{error} — 再試行</button>}
    <div className="mt-4 grid grid-cols-3 gap-2">{other.map((item) => <a key={item.label} href={item.href} className="min-h-20 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs"><strong className="block">{item.label}</strong><span className="mt-2 block text-lg">{item.count === null ? "UNKNOWN" : item.count}</span></a>)}</div>
    {items === null ? <p className="mt-4 text-sm">読み込み中…</p> : items.length === 0 ? <p className="mt-4 rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">承認待ちはありません。</p> : <ul className="mt-4 space-y-3">{items.map((item) => <li id={`approval-${item.id}`} key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><strong>{item.title ?? item.actionType ?? item.id}</strong><p className="mt-1 text-sm text-slate-400">{item.summary ?? item.reason ?? "詳細は既存の承認記録を参照"}</p>{item.contentDraftCandidate ? <details className="mt-3 rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-semibold">内容を見る</summary><p className="mt-3 whitespace-pre-wrap text-sm">{item.contentDraftCandidate.body}</p><dl className="mt-3 grid gap-1 text-xs text-slate-400"><div>Type: {item.contentDraftCandidate.contentType}</div><div>Mission: {item.contentDraftCandidate.parentMissionId}</div><div>Step: {item.contentDraftCandidate.sourceStepId}</div><div>Agent: {item.contentDraftCandidate.createdByAgentId}</div><div>Knowledge: {item.contentDraftCandidate.sourceKnowledgeIds.join(", ") || "なし"}</div><div>Research: {item.contentDraftCandidate.sourceResearchRefs.join(", ") || "なし"}</div><div>KPI: {item.contentDraftCandidate.sourceKpiRefs.join(", ") || "なし"}</div><div>Created: {item.contentDraftCandidate.createdAt}</div></dl></details> : null}<p className="mt-2 text-xs text-slate-500">Risk: {item.riskLevel ?? "UNKNOWN"} · 承認はDraft登録のみ。公開承認ではありません。</p><div className={`mt-3 grid gap-2 ${item.contentDraftCandidate ? "grid-cols-3" : "grid-cols-2"}`}><button onClick={() => void decide(item, "reject")} className="min-h-11 rounded-xl border border-slate-600">却下</button>{item.contentDraftCandidate ? <button onClick={() => void lightEdit(item)} className="min-h-11 rounded-xl border border-violet-500">軽微修正</button> : null}<button onClick={() => void decide(item, "approve")} className="min-h-11 rounded-xl bg-violet-600 font-semibold">Contentへ登録</button></div></li>)}</ul>}
    {notices.length ? <section className="mt-6"><h2 className="font-bold">問題・Blocked</h2><ul className="mt-3 space-y-2">{notices.map((notice) => <li key={notice.id}><a href={notice.deepLink} className="block min-h-11 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>{notice.title}</strong><span className="mt-1 block text-xs text-slate-400">{notice.summary} · {notice.priority}</span></a></li>)}</ul></section> : null}
  </main>;
}
