import { getVaultFile } from "../../vault";

export const MAEMICHI_BRAND_RULES_PATH =
  process.env.MAEMICHI_BRAND_RULES_PATH ??
  "memory/personal/note/MAEMICHI_BRAND_POSTING_RULES.md";

const REQUIRED_MARKERS = [
  "まえみち",
  "ブランド",
  "実体験",
  "投稿品質スコア",
] as const;

export class BrandRulesUnavailableError extends Error {
  constructor(message = "まえみちブランド規則を取得できないため、添削を停止しました") {
    super(message);
    this.name = "BrandRulesUnavailableError";
  }
}

export function validateBrandRules(content: string): string {
  const normalized = content.trim();
  if (!normalized) throw new BrandRulesUnavailableError();
  const missing = REQUIRED_MARKERS.filter((marker) => !normalized.includes(marker));
  if (missing.length > 0) {
    throw new BrandRulesUnavailableError(
      `まえみちブランド規則の必須項目が不足しています: ${missing.join("、")}`
    );
  }
  return normalized;
}

export async function loadMaemichiBrandRules(
  reader: typeof getVaultFile = getVaultFile
): Promise<string> {
  try {
    const file = await reader(MAEMICHI_BRAND_RULES_PATH);
    return validateBrandRules(file.content ?? "");
  } catch (error) {
    if (error instanceof BrandRulesUnavailableError) throw error;
    throw new BrandRulesUnavailableError();
  }
}

