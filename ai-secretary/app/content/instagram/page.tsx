import { CONTENT_BRAND_PROFILE, platformBrandPolicy } from "@/app/lib/content/brandProfile";
import { loadContentCore } from "@/app/lib/content/core/store";

const instagram = platformBrandPolicy("instagram");
export const dynamic = "force-dynamic";

const systemStatus = [
  ["Publishing", "NOT_CONFIGURED", "公開前のHuman ReviewとProvider接続が必要です"],
  ["Metrics", "NOT_CONFIGURED", "取得不能な数値を0として表示しません"],
  ["Affiliate", "NOT_IMPLEMENTED", "既存Offer / Revenue基盤へ後続接続します"],
  ["Carousel", "DEFINED", "CreativeSpecとTemplateは定義済み、Rendererは未実装です"],
  ["Reels", "NOT_IMPLEMENTED", "IG-2で実装予定です"],
] as const;

export default async function InstagramFoundationPage() {
  const core = await loadContentCore();
  const unconfirmed = core.products.filter((product) => product.personalExperience && !product.personalExperience.confirmedByUser);
  const unknownRights = core.mediaAssets.filter((asset) => asset.usageRights === "unknown");
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

      <section>
        <SectionTitle eyebrow="TODAY" title="今日やること" />
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <FoundationCard title="Needs Review"><p className="text-2xl font-bold">{unconfirmed.length}</p><p className="text-sub">本人確認待ちのPersonal Experience</p></FoundationCard>
          <FoundationCard title="Draft / Candidate"><Status value="NOT_IMPLEMENTED" /><p className="mt-2 text-sub">Creative persistenceは未実装です</p></FoundationCard>
          <FoundationCard title="Manual Action Required"><p className="text-2xl font-bold">{unknownRights.length}</p><p className="text-sub">利用権UNKNOWNのAsset</p></FoundationCard>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <FoundationCard title={`PRODUCTS · My Product Vault (${core.products.length})`}>
          {core.products.length === 0 ? <p className="text-sub">商品はまだ登録されていません。</p> : core.products.slice(0, 8).map((product) => <p key={product.id}>{product.brand} {product.name} <span className="text-sub">· {product.ownership}</span></p>)}
        </FoundationCard>
        <FoundationCard title={`ASSETS · Asset Library (${core.mediaAssets.length})`}>
          {core.mediaAssets.length === 0 ? <p className="text-sub">Assetはまだ登録されていません。</p> : core.mediaAssets.slice(0, 8).map((asset) => <p key={asset.id}>{asset.type} <span className="text-sub">· {asset.usageRights}</span></p>)}
        </FoundationCard>
      </section>

      <section>
        <SectionTitle eyebrow="SYSTEM STATUS" title="接続状況" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {systemStatus.map(([name, status, detail]) => <FoundationCard key={name} title={name}><Status value={status} /><p className="mt-2 text-xs text-sub">{detail}</p></FoundationCard>)}
        </div>
      </section>

      <FoundationCard title="Brand Foundation"><p>{CONTENT_BRAND_PROFILE.identity} · {CONTENT_BRAND_PROFILE.sharedPhilosophy}</p><p className="mt-2 text-sub">{instagram.pillars.join(" / ")}</p></FoundationCard>
      <p className="rounded-xl border border-hairline bg-white/[0.02] p-4 text-xs leading-5 text-sub">
        Instagramの公開・Metrics・Automationはまだ接続されていません。利用できない数値を0や推測値として表示しません。
      </p>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-xs font-semibold tracking-[0.16em] text-brand">{eyebrow}</p><h3 className="mt-1 text-lg font-bold text-white">{title}</h3></div>;
}

function Status({ value }: { value: string }) {
  return <span className="inline-flex rounded-full border border-slate-600 bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{value}</span>;
}

function FoundationCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-200">{children}</div>
    </section>
  );
}
