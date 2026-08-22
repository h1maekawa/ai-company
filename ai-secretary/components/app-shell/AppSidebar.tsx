"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CENTER_NODE, HUB_NODES, hubNodeHref } from "@/app/lib/config/hub";

type NavItem = { label: string; icon: string; href: string };
const byId = (id: string): NavItem | null => { const node = HUB_NODES.find((item) => item.id === id); return node ? { label: node.name, icon: node.icon, href: hubNodeHref(node) } : null; };
export const APP_NAV_SECTIONS: { label?: string; items: NavItem[] }[] = [
  { items: [{ label: "ホーム", icon: "⌂", href: "/" }] },
  { items: [byId("grill"), byId("kaizen")].filter((item): item is NavItem => Boolean(item)) },
  { label: "事業部", items: [{ label: CENTER_NODE.name, icon: CENTER_NODE.icon, href: `/chat?node=${CENTER_NODE.id}` }, byId("morning"), byId("note"), byId("content"), byId("fund"), byId("kakei")].filter((item): item is NavItem => Boolean(item)) },
  { label: "共通", items: [{ label: "Knowledge", icon: "🧠", href: "/knowledge" }] },
  { label: "システム", items: [{ label: "Connections", icon: "⚙", href: "/connections" }] },
];
function active(pathname: string, href: string): boolean { const path = href.split("?")[0]; return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`); }
export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <div className="flex h-full flex-col bg-[#0b1020] px-3 py-5"><Link href="/" onClick={onNavigate} className="mb-6 px-3"><p className="text-base font-bold text-white">AI Company</p><p className="mt-0.5 text-[11px] text-slate-500">あなたのAI事業部</p></Link><nav className="space-y-4 overflow-y-auto">{APP_NAV_SECTIONS.map((section, index) => <section key={section.label ?? index}>{section.label && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{section.label}</p>}<div className="space-y-1">{section.items.map((item) => <Link key={`${item.label}-${item.href}`} href={item.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active(pathname, item.href) ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><span aria-hidden>{item.icon}</span><span>{item.label}</span></Link>)}</div></section>)}</nav></div>;
}
