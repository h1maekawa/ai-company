import { callAI } from "@/app/lib/ai/client";

/** 家計カテゴリの正。UIのプルダウンもこれを唯一の定義として参照する */
export const KAKEI_CATEGORIES = [
  "食費", "日用品", "住居", "水道光熱", "通信", "交通",
  "娯楽", "交際", "医療", "教育", "サブスク", "その他",
] as const;
export type KakeiCategory = (typeof KAKEI_CATEGORIES)[number];

const THRESHOLD = Number(process.env.KAKEI_CONFIDENCE_THRESHOLD ?? "0.7");

/**
 * ルール→AI→フォールバックの順で必ずカテゴリを埋める。未分類は返さない。
 * @param existingCategory 家計簿アプリ側が持つカテゴリ（あれば尊重）
 */
export async function classifyMerchant(
  merchantNorm: string,
  existingCategory: string,
  rules: Map<string, string>
): Promise<{ category: string; confidence: number; needsReview: boolean }> {
  // 0. あちらが妥当なカテゴリを持っていれば尊重
  const ext = existingCategory.trim();
  if (ext && ext !== "未分類") {
    return { category: ext, confidence: 1, needsReview: false };
  }
  // 1. 学習ルール一致 → AI不使用で確定（無料・決定的）
  const hit = rules.get(merchantNorm);
  if (hit) return { category: hit, confidence: 1, needsReview: false };
  if (!merchantNorm) return { category: "その他", confidence: 0, needsReview: true };

  // 2. Gemini無料枠で推定（callAI は DEFAULT_PROVIDER=gemini）
  const system =
    "あなたは日本の家計簿の支出分類器です。店名から最も妥当なカテゴリを1つ選び、JSONだけで返します。";
  const message =
    `店名: "${merchantNorm}"\n` +
    `候補カテゴリ: ${KAKEI_CATEGORIES.join(", ")}\n` +
    `次のJSON形式のみで返答: {"category":"<候補のどれか>","confidence":<0〜1の数>}`;
  try {
    const raw = await callAI(message, system, { responseFormat: "json" });
    const j = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      category?: string; confidence?: number;
    };
    const category = (KAKEI_CATEGORIES as readonly string[]).includes(j.category ?? "")
      ? (j.category as string) : "その他";
    const confidence = Math.max(0, Math.min(1, Number(j.confidence ?? 0)));
    return { category, confidence, needsReview: confidence < THRESHOLD };
  } catch {
    // 3. 失敗しても未分類にしない
    return { category: "その他", confidence: 0, needsReview: true };
  }
}
