import { CeoDashboard } from "@/components/mobile-ceo/CeoDashboard";

export default function CeoPage() {
  return <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-5 sm:px-6">
    <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Mobile CEO</p><h1 className="text-2xl font-bold">Control Tower</h1><p className="mt-1 text-sm text-slate-400">判断・承認・依頼を一画面で確認</p></header>
    <CeoDashboard />
  </main>;
}
