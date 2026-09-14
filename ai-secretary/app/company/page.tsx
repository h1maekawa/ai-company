"use client";

import { useState } from "react";
import { PersonalDashboard } from "@/components/company/PersonalDashboard";
import { RevenuePanel } from "@/components/company/RevenuePanel";
import { FinancialSettingsPanel } from "@/components/company/FinancialSettingsPanel";
import { WorldView } from "@/components/company/WorldView";

/**
 * /company — CEOが「今、誰が、何をしているか」を把握するトップ画面。
 * 詳細な経営指標は残すが、初期表示には混ぜない。
 */
export default function CompanyPage() {
  const [showManagement, setShowManagement] = useState(false);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-6 sm:px-6">
      <WorldView />
      <details
        className="rounded-xl border border-hairline bg-ink-card p-4"
        onToggle={(event) => setShowManagement(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs text-sub">
          経営データ・設定
        </summary>
        {showManagement ? (
          <div className="mt-4 space-y-4">
            <PersonalDashboard />
            <RevenuePanel />
            <FinancialSettingsPanel />
          </div>
        ) : null}
      </details>
    </main>
  );
}
