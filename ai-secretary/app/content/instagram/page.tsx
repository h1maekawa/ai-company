import { CONTENT_BRAND_PROFILE, platformBrandPolicy } from "@/app/lib/content/brandProfile";

const instagram = platformBrandPolicy("instagram");

export default function InstagramFoundationPage() {
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-hairline bg-ink-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Instagram</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Men&apos;s Pick</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-sub">{instagram.positioning}</p>
          </div>
          <span className="rounded-full border border-slate-600 bg-slate-500/10 px-3 py-1.5 text-xs font-semibold text-slate-300">
            NOT_CONFIGURED
          </span>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <FoundationCard title="Brand">
          <p>{CONTENT_BRAND_PROFILE.identity}</p>
          <p className="mt-2 text-sub">{CONTENT_BRAND_PROFILE.sharedPhilosophy}</p>
        </FoundationCard>
        <FoundationCard title="Content Pillars">
          <ul className="space-y-1">
            {instagram.pillars.map((pillar) => <li key={pillar}>・{pillar}</li>)}
          </ul>
          <p className="mt-3 text-xs text-sub">主要4領域を約80%、補助4領域を約20%の初期目安とします。</p>
        </FoundationCard>
        <FoundationCard title="Visual Direction">
          <ul className="space-y-1">
            <li>・実商品は実物画像を優先</li>
            <li>・White / Ivory / Gray / Black / Wood</li>
            <li>・Thin Line Illustration</li>
            <li>・Cat / Coffee / Lifestyle Motif</li>
          </ul>
        </FoundationCard>
      </section>

      <p className="rounded-xl border border-hairline bg-white/[0.02] p-4 text-xs leading-5 text-sub">
        Instagramの公開・Metrics・Automationはまだ接続されていません。利用できない数値を0や推測値として表示しません。
      </p>
    </div>
  );
}

function FoundationCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-200">{children}</div>
    </section>
  );
}
