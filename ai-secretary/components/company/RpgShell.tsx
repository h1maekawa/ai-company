"use client";

/**
 * RPG Shell — Phase 4 §31 / §32
 *
 * フルRPGは作らない。建物を並べて、押したらダッシュボードへ行くところまで。
 * §32 の判断どおり Phaser / Pixi は入れず、CSS と React だけで作る。
 * ゲームエンジンを入れると既存のNext.js構成が重くなり、
 * まだ得られる価値（見た目の楽しさ）に見合わない。
 */

import Link from "next/link";
import { useState } from "react";

type Building = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  href: string;
};

const BUILDINGS: Building[] = [
  {
    id: "wealth",
    name: "Wealth Building",
    emoji: "🏦",
    description: "資産を増やす（投資）",
    href: "/investing",
  },
  {
    id: "income",
    name: "Income Building",
    emoji: "💰",
    description: "収支を把握する（家計）",
    href: "/kakei",
  },
  {
    id: "media",
    name: "Media Studio",
    emoji: "📣",
    description: "発信して集める（note / X）",
    href: "/content",
  },
  {
    id: "business",
    name: "Business Lab",
    emoji: "🧪",
    description: "事業を作る（準備中）",
    href: "/company",
  },
  {
    id: "organization",
    name: "Organization Center",
    emoji: "🏢",
    description: "組織を進化させる",
    href: "/company/organization",
  },
  {
    id: "board",
    name: "Board Room",
    emoji: "📊",
    description: "経営を振り返る",
    href: "/company",
  },
];

type AvatarState = "idle" | "move" | "active";

export function RpgShell() {
  const [hovered, setHovered] = useState<string | null>(null);
  const avatarState: AvatarState = hovered ? "move" : "idle";

  return (
    <section className="rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">オフィス</p>
        <CeoAvatar state={avatarState} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BUILDINGS.map((building) => (
          <Link
            key={building.id}
            href={building.href}
            onMouseEnter={() => setHovered(building.id)}
            onMouseLeave={() => setHovered(null)}
            className={`group rounded-xl border p-4 text-center transition-all ${
              hovered === building.id
                ? "border-brand/40 bg-brand/[0.08] -translate-y-0.5"
                : "border-hairline bg-white/[0.02]"
            }`}
          >
            <span className="block text-2xl" aria-hidden>
              {building.emoji}
            </span>
            <span className="mt-1.5 block text-xs font-medium text-white">{building.name}</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-sub">
              {building.description}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** CEOアバター。Idle / Move / Active のみ（§32） */
function CeoAvatar({ state }: { state: AvatarState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2.5 py-1 text-[11px] text-sub ${
        state === "move" ? "animate-pulse" : ""
      }`}
      title={`CEO: ${state}`}
    >
      <span className="text-base" aria-hidden>
        🧑‍💼
      </span>
      CEO
    </span>
  );
}
