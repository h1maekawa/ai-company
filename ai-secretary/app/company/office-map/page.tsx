"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/primitives";
import { OfficeMap } from "@/components/company/office-map/OfficeMap";

/**
 * /company/office-map — 会社全体を部屋として見る2D Office Map。
 *
 * 既存の /company（WorldView / CompanyOfficeOverview / Pixel Office）は置き換えない。
 * ここはその上に重ねるPresentation Layerで、データは既存read modelの再利用だけ。
 */
export default function OfficeMapPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-3 py-6 sm:px-6">
      <Link href="/company" className="inline-flex items-center gap-1 text-xs text-sub hover:text-slate-200">
        ← AI Company（リスト・承認）へ
      </Link>
      <Suspense fallback={<Skeleton className="h-[640px] rounded-2xl" />}>
        <OfficeMap />
      </Suspense>
    </main>
  );
}
