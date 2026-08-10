"use client";

import { useEffect, useState } from "react";

type Offer = { id: string; name: string; type: string; status: string; price?: number; destinationUrl?: string };
type CTA = { id: string; name: string; type: string; text: string; offerId?: string };

const OFFER_TYPES = ["paid-note", "affiliate", "membership", "timebox", "digital-product", "service", "external-product", "other"];
const CTA_TYPES = ["article-end", "article-middle", "x-post", "x-reply", "profile", "product", "membership", "paid-note", "affiliate"];

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ctas, setCtas] = useState<CTA[]>([]);
  const [offerName, setOfferName] = useState("");
  const [offerType, setOfferType] = useState(OFFER_TYPES[0]);
  const [offerUrl, setOfferUrl] = useState("");
  const [ctaName, setCtaName] = useState("");
  const [ctaType, setCtaType] = useState(CTA_TYPES[0]);
  const [ctaText, setCtaText] = useState("");

  const load = () => {
    fetch("/api/content/offers").then((r) => r.json()).then((d) => setOffers(d.offers ?? []));
    fetch("/api/content/cta").then((r) => r.json()).then((d) => setCtas(d.ctas ?? []));
  };
  useEffect(load, []);

  async function createOffer() {
    await api("/api/content/offers", "POST", { offer: { name: offerName, type: offerType, description: "", destinationUrl: offerUrl, status: "draft" } });
    setOfferName("");
    setOfferUrl("");
    load();
  }
  async function toggleOffer(o: Offer) {
    await api("/api/content/offers", "PATCH", { id: o.id, patch: { status: o.status === "active" ? "paused" : "active" } });
    load();
  }
  async function createCta() {
    await api("/api/content/cta", "POST", { cta: { name: ctaName, type: ctaType, text: ctaText } });
    setCtaName("");
    setCtaText("");
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">OFFERS &amp; CTA</h2>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">Offer Library</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="名前（例: DAYLOOP）" className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
          <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
            {OFFER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)} placeholder="紹介先URL" className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
        </div>
        <button onClick={createOffer} disabled={!offerName.trim()} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">Offerを追加</button>

        <div className="mt-4 space-y-1.5">
          {offers.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <span>[{o.type}] {o.name}{o.price ? ` ¥${o.price}` : ""}</span>
              <button onClick={() => toggleOffer(o)} className={`rounded px-2 py-1 text-[10px] ${o.status === "active" ? "bg-gain/20 text-gain" : "bg-white/5 text-sub"}`}>{o.status}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">CTA Library</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input value={ctaName} onChange={(e) => setCtaName(e.target.value)} placeholder="名前" className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
          <select value={ctaType} onChange={(e) => setCtaType(e.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
            {CTA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="文言" className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs" />
        </div>
        <button onClick={createCta} disabled={!ctaName.trim() || !ctaText.trim()} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">CTAを追加</button>
        <div className="mt-4 space-y-1.5">
          {ctas.map((c) => (
            <div key={c.id} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">[{c.type}] {c.name} — {c.text}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
