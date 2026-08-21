/**
 * Knowledge Domain 体系（ADR-G, docs/14）。
 *
 * - Canonical Domain = Knowledge の論理分類（11種）。物理フォルダ構成とは疎結合。
 * - 既存の固定8カテゴリ（Legacy Category）は Alias Resolver で Canonical へ無損失変換する。
 * - 既存 Markdown を一括 move/rename しない。読み込み時に alias 解決するための純関数群。
 * - 未知の domain は勝手に削除・置換・personalへfallbackしない（Phase4 修正2）。
 *   Promotion 前に11 canonical domain のいずれかを必ず確定させる。
 */

/** Canonical Domain（新規Knowledgeはこの11種のみを使用する） */
export const CANONICAL_DOMAINS = [
  "sales",
  "kpi",
  "investment",
  "side-business",
  "marketing",
  "content",
  "ai",
  "technology",
  "management",
  "strategy",
  "personal",
] as const;

export type CanonicalDomain = (typeof CANONICAL_DOMAINS)[number];

/**
 * Legacy Category → Canonical Domain の対応表。
 * ここに無い / 解決できないものは「未知」として warning を出す（自動置換しない）。
 */
export const LEGACY_DOMAIN_ALIASES: Record<string, CanonicalDomain> = {
  sales: "sales",
  marketing: "marketing",
  content: "content",
  strategy: "strategy",
  investing: "investment",
  systems: "technology",
  recruiting: "management", // 暫定: 人事系domainが必要になれば別途新設
  // "misc" は意図的に未解決（warning）。手動 or 文脈で分類する。
};

export type DomainResolution = {
  input: string;
  domain: CanonicalDomain | null;
  isCanonical: boolean;
  isLegacyAlias: boolean;
  isUnknown: boolean;
  warning?: string;
};

export function isCanonicalDomain(value: string): value is CanonicalDomain {
  return (CANONICAL_DOMAINS as readonly string[]).includes(value);
}

/**
 * 入力（Legacy Category / Canonical / 未知）を Canonical Domain に解決する。
 * 破壊的変換はせず、解決結果と warning を返すだけ（呼び出し側が判断する）。
 */
export function resolveDomain(input: string | undefined | null): DomainResolution {
  const raw = (input ?? "").trim();

  if (!raw) {
    return {
      input: "",
      domain: null,
      isCanonical: false,
      isLegacyAlias: false,
      isUnknown: true,
      warning: "domain が空です。Candidate として保持し、Promotion 時に確定してください。",
    };
  }

  if (isCanonicalDomain(raw)) {
    return { input: raw, domain: raw, isCanonical: true, isLegacyAlias: false, isUnknown: false };
  }

  const aliased = LEGACY_DOMAIN_ALIASES[raw.toLowerCase()];
  if (aliased) {
    return {
      input: raw,
      domain: aliased,
      isCanonical: false,
      isLegacyAlias: true,
      isUnknown: false,
      warning: `legacy category "${raw}" を canonical domain "${aliased}" に解決しました（ファイルは移動しません）。`,
    };
  }

  return {
    input: raw,
    domain: null,
    isCanonical: false,
    isLegacyAlias: false,
    isUnknown: true,
    warning: `未知の domain "${raw}" です。自動置換・自動fallbackせず Candidate として保持します。手動で canonical domain を割り当ててください。`,
  };
}

/**
 * Promotion 等の「正式Knowledge書き込み」用に canonical domain を必須化する（Phase4 修正2）。
 * 解決できない場合は **fallback せず throw** する。呼び出し側は Candidate に留めること。
 */
export function requireCanonicalDomain(input: string | undefined | null): CanonicalDomain {
  const r = resolveDomain(input);
  if (!r.domain) {
    throw new Error(
      `domain "${input ?? ""}" は canonical domain に解決できません。` +
        `正式Knowledgeへ昇格する前に、11 canonical domain のいずれかを確定してください。`
    );
  }
  return r.domain;
}
