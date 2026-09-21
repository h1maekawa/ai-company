"use client";
import { useState, type FormEvent } from "react";

const actions = [
  ["Engineering Request", "人間確認後にIssueを作成（実装開始は別承認）", "engineering"],
  ["Content Idea", "Knowledge候補として保存", "content"],
  ["Knowledge Capture", "知識候補として保存", "knowledge"],
  ["Investment Decision", "既存Fund画面で人間Decisionを記録", "fund"],
  ["Transaction Record", "人間が実行済みの約定Factを記録", "transaction"],
  ["Mission / Task", "手動Missionを作成", "mission"],
] as const;

export default function CeoActionsPage() {
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!kind) return;
    const form = new FormData(event.currentTarget); const text = String(form.get("text") ?? "").trim();
    if (!text || !window.confirm("この内容を人間CEOの操作として登録しますか？")) return;
    setBusy(true); setMessage("");
    const key = crypto.randomUUID();
    try {
      const endpoint = kind === "engineering" ? "/api/engineering/requests" : kind === "mission" ? "/api/company/missions/manual" : kind === "content" ? "/api/content/candidates" : "/api/knowledge/capture";
      const body = kind === "engineering"
        ? { title: text, goal: String(form.get("detail") ?? ""), acceptanceCriteria: "CEOが内容を確認し、CIが通ること", taskType: "feature", priority: "medium", confirmedByHuman: true }
        : kind === "mission" ? { title: text, description: String(form.get("detail") ?? "") }
        : kind === "content" ? { title: text, summary: String(form.get("detail") ?? ""), sourceType: "manual", sourceIds: [], whyInteresting: "CEO mobile capture", evidence: [] }
        : { content: `${text}\n${String(form.get("detail") ?? "")}`, organize: true };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "登録できませんでした");
      setMessage("登録しました。重要な実行は引き続き人間確認が必要です。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "登録できませんでした"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-4 py-5"><h1 className="text-2xl font-bold">Quick Action</h1><p className="mt-1 text-sm text-slate-400">AIへの入力または人間の判断記録。自動発注・自動公開は行いません。</p>
    <div className="mt-4 grid grid-cols-2 gap-3">{actions.map(([title, detail, value]) => <button key={value} type="button" onClick={() => setKind(value)} className="min-h-24 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-left"><strong className="text-sm">{title}</strong><span className="mt-1 block text-xs text-slate-400">{detail}</span></button>)}</div>
    {kind && (kind === "fund" || kind === "transaction") ? <div className="mt-4 rounded-2xl border border-amber-800 bg-amber-950/30 p-4 text-sm"><p>Fundの既存画面で、候補採否または人間が実行済みの約定Factを記録してください。AIは証券注文を実行できません。</p><a href="/investing" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-amber-700 px-4 font-semibold">Fund画面へ</a></div> : kind && <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4"><label className="block text-sm">タイトル / 内容<input name="text" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3" /></label><label className="block text-sm">目的 / 補足<textarea name="detail" className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label><button disabled={busy} className="min-h-11 w-full rounded-xl bg-violet-600 px-4 font-semibold disabled:opacity-50">確認して登録</button></form>}
    {message && <p role="status" className="mt-3 text-sm text-violet-200">{message}</p>}
  </main>;
}
