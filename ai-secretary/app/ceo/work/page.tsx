import Link from "next/link";
import { DEPARTMENT_NAV } from "@/app/lib/config/navigation";

export default function CeoWorkPage() {
  return (
    <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-5">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-violet-300">← ホーム</Link>
      <h1 className="mb-4 text-2xl font-bold">事業部</h1>
      <div className="space-y-3">
        {DEPARTMENT_NAV.map((item) => <Link key={item.id} href={item.href} className="block min-h-16 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><strong>{item.icon} {item.label}</strong><span className="mt-1 block text-sm text-slate-400">{item.description}</span></Link>)}
      </div>
    </main>
  );
}
