"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Material = { id: string; title: string; rawContent: string; sourceType: string };

export default function ResearchPage() {
  const [items, setItems] = useState<Material[]>([]);

  useEffect(() => {
    fetch("/api/content/materials")
      .then((r) => r.json())
      .then((d) => setItems((d.available ?? []).filter((m: Material) => m.sourceType === "research")));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">RESEARCH</h2>
        <Link href="/note" className="text-xs text-brand hover:underline">既存のResearch設定・実行はこちら →</Link>
      </div>
      <p className="text-sm text-sub">Research Content Providerが見ているtrend-cluster / research-inboxの内容です。取り込むとMaterialになります。</p>

      <section className="rounded-2xl border border-hairline bg-ink-card p-4">
        <div className="space-y-1.5">
          {items.length === 0 && <p className="text-xs text-sub">Researchはまだありません（Research機能を実行するとここに表示されます）。</p>}
          {items.slice(0, 30).map((m) => (
            <div key={m.id} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">
              <p className="font-semibold">{m.title}</p>
              <p className="mt-0.5 text-sub">{m.rawContent.slice(0, 120)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
