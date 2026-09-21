import Link from "next/link";
const areas = [
  ["Creator", "/content", "企画・公開・収益"], ["Fund", "/investing", "分析候補・Decision・Ledger"],
  ["Knowledge", "/knowledge", "Captureと昇格候補"], ["Company", "/company", "Mission・組織・収益"],
  ["Engineering", "/admin", "Issue・Worker・PR"],
];
export default function CeoWorkPage() { return <main className="mx-auto max-w-3xl px-4 py-5"><h1 className="mb-4 text-2xl font-bold">Work</h1><div className="space-y-3">{areas.map(([title, href, detail]) => <Link key={title} href={href} className="block min-h-16 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><strong>{title}</strong><span className="mt-1 block text-sm text-slate-400">{detail}</span></Link>)}</div></main>; }
