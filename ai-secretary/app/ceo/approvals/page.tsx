"use client";
import { useCallback, useEffect, useState } from "react";

type Approval = { id: string; title?: string; actionType?: string; reason?: string; status?: string };
export default function CeoApprovalsPage() {
  const [items, setItems] = useState<Approval[] | null>(null); const [error, setError] = useState("");
  const [other, setOther] = useState<Array<{ label: string; count: number | null; href: string }>>([]);
  const load = useCallback(async () => { try {
    const requests = await Promise.allSettled([fetch("/api/company/approvals"), fetch("/api/content/candidates"), fetch("/api/knowledge/candidates"), fetch("/api/fund/learning")]);
    const read = async (index: number) => requests[index].status === "fulfilled" && requests[index].value.ok ? requests[index].value.json() : null;
    const [company, content, knowledge, fund] = await Promise.all([read(0), read(1), read(2), read(3)]);
    if (!company) throw new Error();
    setItems(company.pending ?? []);
    setOther([
      { label: "Content候補", count: content ? (content.candidates ?? []).filter((item: { status?: string }) => item.status === "suggested").length : null, href: "/content/review" },
      { label: "Knowledge候補", count: knowledge && typeof knowledge.count === "number" ? knowledge.count : null, href: "/weekly-review" },
      { label: "Fund Learning", count: fund ? (fund.learnings ?? []).filter((item: { status?: string }) => item.status === "candidate").length : null, href: "/investing" },
    ]);
    setError("");
  } catch { setError("承認一覧を取得できませんでした"); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(item: Approval, decision: "approve" | "reject") {
    if (!window.confirm(`${item.title ?? item.actionType ?? "この操作"}を${decision === "approve" ? "承認" : "却下"}しますか？`)) return;
    const response = await fetch(`/api/company/approvals/${encodeURIComponent(item.id)}/${decision}`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
    if (!response.ok) setError("判断を保存できませんでした"); else void load();
  }
  return <main className="mx-auto max-w-3xl px-4 py-5"><h1 className="text-2xl font-bold">Approvals</h1><p className="mt-1 text-sm text-slate-400">既存Approval SSOTを横断表示します。承認は実行権限の拡張を意味しません。</p>
    {error && <button onClick={() => void load()} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-4">{error} — 再試行</button>}
    <div className="mt-4 grid grid-cols-3 gap-2">{other.map((item) => <a key={item.label} href={item.href} className="min-h-20 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs"><strong className="block">{item.label}</strong><span className="mt-2 block text-lg">{item.count === null ? "UNKNOWN" : item.count}</span></a>)}</div>
    {items === null ? <p className="mt-4 text-sm">読み込み中…</p> : items.length === 0 ? <p className="mt-4 rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">承認待ちはありません。</p> : <ul className="mt-4 space-y-3">{items.map((item) => <li key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><strong>{item.title ?? item.actionType ?? item.id}</strong><p className="mt-1 text-sm text-slate-400">{item.reason ?? "詳細は既存の承認記録を参照"}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => void decide(item, "reject")} className="min-h-11 rounded-xl border border-slate-600">却下</button><button onClick={() => void decide(item, "approve")} className="min-h-11 rounded-xl bg-violet-600 font-semibold">承認</button></div></li>)}</ul>}
  </main>;
}
