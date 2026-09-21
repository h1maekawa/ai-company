"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import { DepartmentChat } from "@/components/mobile-ceo/DepartmentChat";

export const OPEN_MEMO_EVENT = "ai-company:open-memo";

export function WorkspaceOverlays() {
  const pathname = usePathname();
  const [memoOpen, setMemoOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const departmentId = pathname.match(/^\/ceo\/departments\/(creator|fund|operations|knowledge|planning|engineering)(?:\/|$)/)?.[1] as NavigationDepartmentId | undefined;
  const department = departmentId ? DEPARTMENT_NAV_BY_ID[departmentId] : null;
  useEffect(() => { const open = () => setMemoOpen(true); window.addEventListener(OPEN_MEMO_EVENT, open); return () => window.removeEventListener(OPEN_MEMO_EVENT, open); }, []);
  async function saveMemo(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/company/memo", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ content: form.get("content"), sourcePage: pathname }) }); setMessage(response.ok ? "Inboxへ保存しました。正式Knowledgeには昇格していません。" : "保存できませんでした。"); if (response.ok) event.currentTarget.reset(); }
  return <>
    <button type="button" aria-label={`${department?.label ?? "秘書"}とのチャットを開く`} onClick={() => setChatOpen(true)} className="fixed bottom-20 right-4 z-30 flex min-h-12 min-w-12 items-center justify-center rounded-full bg-violet-600 text-xl shadow-xl lg:bottom-6">◉</button>
    {memoOpen ? <Sheet title="メモ" close={() => { setMemoOpen(false); setMessage(""); }}><form onSubmit={saveMemo} className="space-y-3"><textarea name="content" required placeholder="思いついたことを書く…" className="min-h-40 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"/><div className="text-xs text-slate-400">保存先: Inbox<br/>Context: {pathname}</div><button className="min-h-11 w-full rounded-xl bg-violet-600 font-semibold">保存</button>{message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}</form></Sheet> : null}
    {chatOpen ? <Sheet title={department?.label ?? "秘書"} close={() => setChatOpen(false)}>{department ? <DepartmentChat id={department.id} label={department.label} secretaryId={department.secretaryId} onDirective={() => setChatOpen(false)}/> : <div className="space-y-3"><p className="text-sm text-slate-400">会社全体の相談は秘書が受け付けます。</p><Link href="/chat?node=assistant" className="flex min-h-11 items-center justify-center rounded-xl bg-violet-600 font-semibold">秘書Chatを開く</Link></div>}</Sheet> : null}
  </>;
}

function Sheet({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 lg:items-stretch" role="dialog" aria-modal="true" aria-label={title}><button type="button" aria-label="閉じる" onClick={close} className="absolute inset-0"/><aside className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-[#0b1020] p-4 lg:h-full lg:max-h-none lg:max-w-md lg:rounded-none"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={close} className="min-h-11 min-w-11 rounded-xl border border-slate-700">×</button></div>{children}</aside></div>; }
