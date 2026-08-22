"use client";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="min-h-screen bg-[#0f1117] text-slate-100"><aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800/80 lg:block"><AppSidebar /></aside><button type="button" aria-label="メニューを開く" aria-expanded={open} onClick={() => setOpen(true)} className="fixed left-3 top-3 z-30 rounded-xl border border-slate-700 bg-slate-900/95 p-2 text-slate-200 shadow-lg lg:hidden"><Menu className="h-5 w-5" /></button>{open && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="メニューを閉じる" className="absolute inset-0 bg-black/65" onClick={() => setOpen(false)} /><aside className="relative h-full w-72 max-w-[86vw] border-r border-slate-700 shadow-2xl"><button aria-label="メニューを閉じる" onClick={() => setOpen(false)} className="absolute right-3 top-3 z-10 p-2 text-slate-400"><X className="h-5 w-5" /></button><AppSidebar onNavigate={() => setOpen(false)} /></aside></div>}<div className="min-h-screen lg:pl-60">{children}</div></div>;
}
