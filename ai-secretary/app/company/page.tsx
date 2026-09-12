"use client";

import { PersonalDashboard } from "@/components/company/PersonalDashboard";
import { RpgShell } from "@/components/company/RpgShell";

/**
 * /company — Personal AI Company のCEOダッシュボード（Phase 4 §30 / §31）
 */
export default function CompanyPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-6 sm:px-6">
      <PersonalDashboard />
      <RpgShell />
    </main>
  );
}
