import { InvestingShell } from "@/components/investing/Shell";
import PolicyEngineSection from "./PolicyEngineSection";

/**
 * /investing/policy — 投資判断エンジン（Fund Policy Engine, docs/12）。
 * PolicyEngineSection の実装はここが Canonical。旧 /fund は本ページへ 308 redirect。
 */
export default function InvestingPolicyPage() {
  return (
    <InvestingShell title="投資判断エンジン">
      <PolicyEngineSection />
    </InvestingShell>
  );
}
