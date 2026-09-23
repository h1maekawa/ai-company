"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CanonicalResearchArtifact, FactRef, ResearchFact } from "@/app/lib/company/research/types";
import { Badge } from "@/components/investing/ui";

const STEP_LABEL: Record<string, string> = {
  overview: "Overview", business: "Business", growth: "Growth", earnings: "Earnings", valuation: "Valuation Inputs", risk: "Risks", thesis_inputs: "Catalysts / Thesis Inputs",
  growth_drivers: "Growth Drivers", demand_chain: "Demand Chain", dependencies: "Dependencies", value_chain: "Value Chain", bottlenecks: "Bottlenecks",
  beneficiary_industries: "Beneficiary Industries", companies: "Company Candidates", substitutability: "代替可能性", pricing_power: "Pricing Power",
  durability: "構造的か一時的か", thesis_breakers: "Thesis Breakers", risks: "Risks",
  current_topics: "Current Topics", audience_interest: "Audience Interest", competing_content: "Competing Content", format_patterns: "Format Patterns", hooks: "Hooks", content_opportunities: "Content Opportunities",
};
const ROLE_LABEL: Record<string, string> = { direct_beneficiary: "Direct beneficiary", supplier: "Supplier", infrastructure_provider: "Infrastructure provider", equipment_provider: "Equipment provider", critical_component: "Critical component", second_order_beneficiary: "Second-order beneficiary" };

/** TTL内は FRESH、超えたら STALE。stale を「最新」とは表示しない */
export function artifactFreshness(artifact: CanonicalResearchArtifact, now = Date.now()): "FRESH" | "STALE" | "UNKNOWN" {
  const asOf = Date.parse(artifact.intelligence.asOf);
  if (!Number.isFinite(asOf)) return "UNKNOWN";
  return now - asOf <= artifact.intelligence.ttlHours * 3_600_000 ? "FRESH" : "STALE";
}

function FactRefs({ refs, facts }: { refs: FactRef[]; facts: ResearchFact[] }) {
  const sourced = refs.map((ref) => facts[ref]).filter((fact) => fact?.source.url);
  if (!sourced.length) return <span className="text-[11px] text-amber-200/80">Evidenceなし（確定情報ではありません）</span>;
  return <span className="text-[11px] text-sub">{refs.map((ref) => `#${ref + 1}`).join(" ")}</span>;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2"><h4 className="text-xs font-semibold text-sub">{title}</h4><div className="text-sm text-slate-200">{children}</div></section>;
}

/** Canonical Research Artifact の表示。Fact / 解釈 / Unknown を分け、Factごとに出典を追えるようにする */
export function ResearchArtifactView({ artifact }: { artifact: CanonicalResearchArtifact }) {
  const intel = artifact.intelligence;
  const freshness = artifactFreshness(artifact);
  const ext = intel.investmentExt;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-white">{artifact.topic}</h3>
        <Badge>{intel.topicKey}</Badge>
        <Badge tone={intel.status === "VERIFIED" ? "gain" : intel.status === "PARTIAL" ? "brand" : "loss"}>{intel.status}</Badge>
        <Badge tone={freshness === "FRESH" ? "gain" : "loss"}>{freshness}</Badge>
      </div>
      <p className="text-[11px] text-sub">{intel.playbookId} · depth {intel.depth} · As of {intel.asOf.slice(0, 16).replace("T", " ")}{intel.refreshedAt ? "（更新）" : ""} · TTL {intel.ttlHours}h{freshness === "STALE" ? " · 最新ではありません（再度Askすると更新します）" : ""}</p>
      {intel.depth === "quick" && intel.playbookId === "theme-research" ? <p className="text-[11px] text-amber-200/80">quick のテーマResearchは一部stepのみです（PARTIAL前提）。</p> : null}

      {intel.sections.length ? (
        <div className="space-y-3">
          {intel.sections.map((section) => (
            <Block key={section.step} title={STEP_LABEL[section.step] ?? section.step}>
              <p>{section.summary}</p>
              <FactRefs refs={section.factRefs} facts={intel.facts} />
            </Block>
          ))}
        </div>
      ) : null}

      {ext?.bottlenecks?.length ? (
        <Block title="Bottlenecks">
          <ul className="space-y-1">{ext.bottlenecks.map((item) => <li key={item.name}>{item.name} <span className="text-[11px] text-sub">({item.constraintTypes.join(", ")})</span> <FactRefs refs={item.factRefs} facts={intel.facts} /></li>)}</ul>
        </Block>
      ) : null}
      {ext?.valueChain?.length ? <Block title="Value Chain"><p>{ext.valueChain.join(" → ")}</p></Block> : null}
      {ext?.companies?.length ? (
        <Block title="Company Candidates（推奨銘柄ではありません）">
          <ul className="space-y-1">
            {ext.companies.map((company) => (
              <li key={`${company.name}-${company.ticker ?? ""}`}>
                {company.ticker ? <Link href={`/investing/companies/${encodeURIComponent(company.ticker)}`} className="text-brand">{company.name}（{company.ticker}）</Link> : company.name}
                <span className="ml-2 text-[11px] text-sub">{ROLE_LABEL[company.role]} · 代替 {company.substitutability ?? "unknown"} · Pricing Power {company.pricingPower ?? "unknown"} · {company.durability ?? "unknown"}</span>{" "}
                <FactRefs refs={company.factRefs} facts={intel.facts} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {ext?.thesisBreakers?.length ? <Block title="Thesis Breakers"><ul className="list-disc pl-5">{ext.thesisBreakers.map((line) => <li key={line}>{line}</li>)}</ul></Block> : null}

      <Block title={`Facts（出典付き ${intel.facts.filter((fact) => fact.source.url).length} / ${intel.facts.length}）`}>
        <ol className="space-y-2">
          {intel.facts.map((fact, index) => (
            <li key={`${index}-${fact.statement.slice(0, 20)}`} className="rounded-lg bg-white/[0.02] p-2">
              <p><span className="text-sub">#{index + 1}</span> {fact.statement}</p>
              <p className="mt-1 text-[11px] text-sub">
                {fact.source.url ? <a href={fact.source.url} target="_blank" rel="noopener noreferrer" className="text-brand">{fact.source.name ?? "source"}</a> : "Sourceなし"}
                {" · "}{fact.source.reliability}{fact.source.publishedAt ? ` · Published ${fact.source.publishedAt.slice(0, 10)}` : ""} · Fetched {fact.source.fetchedAt.slice(0, 10)}
              </p>
            </li>
          ))}
        </ol>
      </Block>

      {intel.interpretation.length ? <Block title="Interpretation（AIの解釈・未確定）"><ul className="list-disc pl-5 text-slate-300">{intel.interpretation.map((line) => <li key={line}>{line}</li>)}</ul></Block> : null}
      <Block title="Unknowns"><ul className="list-disc pl-5 text-sub">{intel.unknowns.length ? intel.unknowns.map((line) => <li key={line}>{line}</li>) : <li>なし</li>}</ul></Block>
      <p className="text-[11px] text-sub">これはResearchです。売買判断はFund Manager / 本人が行い、証券注文には接続されていません。</p>
    </div>
  );
}
