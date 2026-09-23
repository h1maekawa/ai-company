import type { IntelligenceArtifactStatus, ResearchFact, ResearchPlaybookId, ResearchReliability } from "../types";

/**
 * Source Safety。
 * - LLMはSourceではない。FactのURLは当該Research実行でProviderが返したURL（allowlist）だけ。
 * - allowlist外のURLは捨て、そのFactは Evidence なしとして扱う（VERIFIED判定に数えない）。
 * - reliability UNKNOWN を PRIMARY 扱いしない。
 */

const COUNTABLE: ResearchReliability[] = ["PRIMARY", "HIGH", "MEDIUM"];
const STRONG: ResearchReliability[] = ["PRIMARY", "HIGH"];
/** 決算・財務数値・バリュエーションに関するFact。投資Researchでは PRIMARY / HIGH の出典でしか確定扱いしない */
const FINANCIAL = /revenue|sales|eps|earnings|margin|guidance|valuation|p\/e|\bper\b|ev\/ebitda|free cash flow|\bfcf\b|operating income|net income|売上|利益|決算|マージン|粗利|バリュエーション|株価収益率|ガイダンス|純利益|営業利益/iu;

export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); if (!/^https?:$/.test(url.protocol)) return undefined; url.hash = ""; return url.toString(); } catch { return undefined; }
}

export function sourceAllowlist(urls: Array<string | undefined>): Set<string> {
  return new Set(urls.map(normalizeUrl).filter((url): url is string => Boolean(url)));
}

/** 公式開示・IRは PRIMARY。それ以外は Provider の判定をそのまま使う（引き上げない） */
export function classifyReliability(url: string | undefined, providerReliability: ResearchReliability | undefined): ResearchReliability {
  const base = providerReliability ?? "UNKNOWN";
  const normalized = normalizeUrl(url);
  if (!normalized) return base === "PRIMARY" ? "UNKNOWN" : base;
  const host = new URL(normalized).hostname.toLowerCase();
  if (host === "sec.gov" || host.endsWith(".sec.gov") || host.endsWith(".gov") || /^(?:ir|investors?)\./.test(host)) return "PRIMARY";
  return base;
}

export function isFinancialStatement(statement: string): boolean {
  return FINANCIAL.test(statement);
}

function withinTtl(fetchedAt: string, ttlHours: number, now: Date): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now.getTime() - at <= ttlHours * 3_600_000;
}

/** VERIFIEDに数えてよいFactか（Δ11） */
export function isQualifyingFact(fact: ResearchFact, context: { ttlHours: number; now: Date; investment: boolean }): boolean {
  if (!fact.source.url) return false;
  if (!COUNTABLE.includes(fact.source.reliability)) return false;
  if (!withinTtl(fact.source.fetchedAt, context.ttlHours, context.now)) return false;
  if (context.investment && isFinancialStatement(fact.statement) && !STRONG.includes(fact.source.reliability)) return false;
  return true;
}

export function artifactStatus(facts: ResearchFact[], context: { ttlHours: number; now: Date; investment: boolean; providerEvidence: boolean }): IntelligenceArtifactStatus {
  if (!context.providerEvidence || facts.length === 0) return "UNVERIFIED";
  const qualifying = facts.filter((fact) => isQualifyingFact(fact, context)).length;
  if (qualifying === 0) return "UNVERIFIED";
  return qualifying === facts.length ? "VERIFIED" : "PARTIAL";
}

/** 投資Researchで Evidence不足の財務Factを Unknown へ残すための一覧 */
export function unverifiedFinancialFacts(facts: ResearchFact[]): string[] {
  return facts.filter((fact) => isFinancialStatement(fact.statement) && !(fact.source.url && STRONG.includes(fact.source.reliability))).map((fact) => `財務Factの出典が不十分なため未確定: ${fact.statement.slice(0, 160)}`);
}

export function isInvestmentPlaybook(playbookId: ResearchPlaybookId): boolean {
  return playbookId !== "platform-research";
}

/**
 * Refresh時（Δ8）: 今回取得できなかった旧Factは fetchedAt を元の値のまま残す。
 * 新しいFactを先頭に置き、既存 factRefs（新Factへの参照）がずれないようにする。
 */
export function mergeRefreshedFacts(fresh: ResearchFact[], previous: ResearchFact[]): ResearchFact[] {
  const key = (fact: ResearchFact) => `${fact.source.url ?? ""}|${fact.statement.trim().toLowerCase()}`;
  const seen = new Set(fresh.map(key));
  return [...fresh, ...previous.filter((fact) => !seen.has(key(fact)))];
}
