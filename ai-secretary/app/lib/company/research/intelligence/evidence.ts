import { createHash } from "node:crypto";
import { FACT_KINDS, type FactKind, type IntelligenceArtifactStatus, type ResearchFact, type ResearchPlaybookId, type ResearchReliability } from "../types";

/**
 * Source Safety / Evidence Integrity。
 * - LLMはSourceではない。FactのURLは当該Research実行でProviderが返したURL（allowlist）だけ。
 * - URLの無いProvider Evidence（market/api等）も、URLが無い=Evidenceなし扱いにはしない（evidenceIdで保持する）。
 * - reliability UNKNOWN を PRIMARY 扱いしない。host名だけで安易にPRIMARYへ昇格しない（明確なOfficial Sourceだけ）。
 */

const COUNTABLE: ResearchReliability[] = ["PRIMARY", "HIGH", "MEDIUM"];
const STRONG: ResearchReliability[] = ["PRIMARY", "HIGH"];
/** 財務数値に関するFact kind。PRIMARY / HIGH の出典でしか確定扱いしない */
const STRONG_ONLY_KINDS: FactKind[] = ["financial", "earnings", "valuation"];

export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); if (!/^https?:$/.test(url.protocol)) return undefined; url.hash = ""; return url.toString(); } catch { return undefined; }
}

export function sourceAllowlist(urls: Array<string | undefined>): Set<string> {
  return new Set(urls.map(normalizeUrl).filter((url): url is string => Boolean(url)));
}

/**
 * 公式開示（sec.gov / *.gov）だけを自動PRIMARYにする。
 * "ir.example.com" のようなhost名の接頭辞だけでPRIMARYへ昇格させない（誰でも登録できるため偽装できてしまう）。
 * 判断できなければProviderが示したreliabilityをそのまま使う（URLが無くてもEvidenceなし扱いにはしない）。
 */
export function classifyReliability(url: string | undefined, providerReliability: ResearchReliability | undefined): ResearchReliability {
  const base = providerReliability ?? "UNKNOWN";
  const normalized = normalizeUrl(url);
  if (!normalized) return base;
  const host = new URL(normalized).hostname.toLowerCase();
  if (host === "sec.gov" || host.endsWith(".sec.gov") || host.endsWith(".gov")) return "PRIMARY";
  return base;
}

/** LLM出力の kind を検証する。不正値・未設定は fail-safe で general（文章Regexからは推測しない） */
export function normalizeFactKind(value: unknown): FactKind {
  return (FACT_KINDS as readonly string[]).includes(value as string) ? (value as FactKind) : "general";
}

/** URL または evidenceId のどちらかがあれば Evidence ありとみなす */
export function hasEvidence(fact: Pick<ResearchFact, "source">): boolean {
  return Boolean(fact.source.url || fact.source.evidenceId);
}

/**
 * Factの決定的なstable id。statement正規化 + provider identity（url優先、無ければevidenceId、それも無ければname）からfingerprintを作る。
 * Random UUIDは使わない。同じ内容のFactは常に同じidになるため、Refreshでfacts配列の順序が変わっても参照が壊れない。
 */
export function factId(input: { statement: string; source: { url?: string; evidenceId?: string; name?: string } }): string {
  const normalizedStatement = input.statement.trim().toLowerCase().replace(/\s+/g, " ");
  const identity = input.source.url ?? input.source.evidenceId ?? input.source.name ?? "unknown";
  return `fact_${createHash("sha256").update(`${identity}|${normalizedStatement}`).digest("hex").slice(0, 20)}`;
}

function withinTtl(fetchedAt: string, ttlHours: number, now: Date): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now.getTime() - at <= ttlHours * 3_600_000;
}

/** VERIFIEDに数えてよいFactか。financial / earnings / valuation は PRIMARY / HIGH のみ、general は MEDIUM 以上まで */
export function isQualifyingFact(fact: ResearchFact, context: { ttlHours: number; now: Date }): boolean {
  if (!hasEvidence(fact)) return false;
  if (!COUNTABLE.includes(fact.source.reliability)) return false;
  if (!withinTtl(fact.source.fetchedAt, context.ttlHours, context.now)) return false;
  if (STRONG_ONLY_KINDS.includes(fact.kind) && !STRONG.includes(fact.source.reliability)) return false;
  return true;
}

/**
 * Artifact全体のstatus。
 * Refreshで保持した古い（TTL切れの）Factは分母（denominator）に入れない — activeFacts = TTL内のFactだけで判定する。
 * Provider Evidence自体を取得できなかった場合はUNVERIFIED。
 */
export function artifactStatus(facts: ResearchFact[], context: { ttlHours: number; now: Date; providerEvidence: boolean }): IntelligenceArtifactStatus {
  if (!context.providerEvidence) return "UNVERIFIED";
  const activeFacts = facts.filter((fact) => withinTtl(fact.source.fetchedAt, context.ttlHours, context.now));
  if (activeFacts.length === 0) return "UNVERIFIED";
  const qualifying = activeFacts.filter((fact) => isQualifyingFact(fact, context));
  if (qualifying.length === 0) return "UNVERIFIED";
  return qualifying.length === activeFacts.length ? "VERIFIED" : "PARTIAL";
}

/** financial / earnings / valuation のうち、出典が不十分（URL/evidenceId無し、またはPRIMARY/HIGH未満）なFactをUnknownへ残すための一覧 */
export function underEvidencedStrongFacts(facts: ResearchFact[]): string[] {
  return facts
    .filter((fact) => STRONG_ONLY_KINDS.includes(fact.kind) && !(hasEvidence(fact) && STRONG.includes(fact.source.reliability)))
    .map((fact) => `${fact.kind}Factの出典が不十分なため未確定: ${fact.statement.slice(0, 160)}`);
}

export function isInvestmentPlaybook(playbookId: ResearchPlaybookId): boolean {
  return playbookId !== "platform-research";
}

/**
 * Refresh時: 今回取得できなかった旧Factは fetchedAt を元の値のまま残す。
 * fact.id が内容から決定的に決まるため、重複判定・参照の安定性はidだけで成立する（新しいFactを先頭に置く）。
 */
export function mergeRefreshedFacts(fresh: ResearchFact[], previous: ResearchFact[]): ResearchFact[] {
  const seen = new Set(fresh.map((fact) => fact.id));
  return [...fresh, ...previous.filter((fact) => !seen.has(fact.id))];
}
