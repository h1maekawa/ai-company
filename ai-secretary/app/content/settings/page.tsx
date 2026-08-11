"use client";

import { useEffect, useState } from "react";

type Policy = {
  allowedOfferTypes: string[];
  prohibitedCategories: string[];
  affiliateDisclosure: string;
  pricingNotes?: string;
};

const OFFER_TYPES = ["paid-note", "affiliate", "membership", "timebox", "digital-product", "service", "external-product", "other"];

export default function ContentSettingsPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    fetch("/api/content/policy").then((r) => r.json()).then((d) => setPolicy(d.policy));
  }, []);

  function toggle(type: string) {
    if (!policy) return;
    const allowedOfferTypes = policy.allowedOfferTypes.includes(type)
      ? policy.allowedOfferTypes.filter((t) => t !== type)
      : [...policy.allowedOfferTypes, type];
    setPolicy({ ...policy, allowedOfferTypes });
  }

  async function save() {
    if (!policy) return;
    await fetch("/api/content/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy }) });
  }

  if (!policy) return <p className="text-xs text-sub">読み込み中…</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">MONETIZATION SETTINGS</h2>
      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">現在利用する収益源</p>
        <p className="mt-1 text-[11px] text-sub">有効化されていない収益源はAIが勝手に推薦しません。</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OFFER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`rounded-lg border px-3 py-2 text-xs ${policy.allowedOfferTypes.includes(t) ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-white/[0.02] text-sub"}`}
            >
              {policy.allowedOfferTypes.includes(t) ? "✓ " : "○ "}{t}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <p className="text-sm font-semibold">Affiliate表記</p>
        <input
          value={policy.affiliateDisclosure}
          onChange={(e) => setPolicy({ ...policy, affiliateDisclosure: e.target.value })}
          className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs"
        />
        <p className="mt-2 text-[11px] text-sub">広告・Affiliateであることを明示する表記です。AIがこの表記を隠すことはありません。</p>
      </section>

      <button onClick={save} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold">保存</button>
    </div>
  );
}
