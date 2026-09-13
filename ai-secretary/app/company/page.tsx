"use client";

import { PersonalDashboard } from "@/components/company/PersonalDashboard";
import { RevenuePanel } from "@/components/company/RevenuePanel";
import { FinancialSettingsPanel } from "@/components/company/FinancialSettingsPanel";
import { RpgShell } from "@/components/company/RpgShell";
import { WorldView } from "@/components/company/WorldView";

/**
 * /company — Personal AI Company のCEOダッシュボード（Phase 4 §30 / §31）
 */
export default function CompanyPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-6 sm:px-6">
      <PersonalDashboard />
      {/* 収益とMoney Quest（Phase 5）。最初の1円が未達のうちは最上部寄りに置く */}
      <RevenuePanel />
      {/* Phase 6: 承認・AI社員の状態・セキュリティを実データで表示する */}
      <WorldView />
      <FinancialSettingsPanel />
      <details>
        <summary className="cursor-pointer text-xs text-sub">
          各部門へのナビゲーション
        </summary>
        <RpgShell />
      </details>
    </main>
  );
}
