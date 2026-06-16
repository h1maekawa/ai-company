import { toSlug } from "../utils/slug";

export type KnowledgeCategory =
  | "sales"
  | "marketing"
  | "recruiting"
  | "investing"
  | "systems"
  | "content"
  | "strategy"
  | "misc";

export interface SaveSuggestion {
  suggestSave: boolean;
  category?: KnowledgeCategory;
  slug?: string;
  importance?: 1 | 2 | 3;
  replyWithoutMetadata: string;
}

const SAVE_KEYWORDS = [
  "戦略",
  "改善",
  "分析",
  "仮説",
  "設計",
  "営業",
  "投資",
  "採用",
  "集客",
  "仕組み化",
];

const VALID_CATEGORIES: KnowledgeCategory[] = [
  "sales",
  "marketing",
  "recruiting",
  "investing",
  "systems",
  "content",
  "strategy",
  "misc",
];

/**
 * Parses save suggestion from message and reply using keyword rules and LLM JSON comment metadata.
 */
export function parseSaveSuggestion(message: string, reply: string): SaveSuggestion {
  const ruleMatched = SAVE_KEYWORDS.some((kw) => message.includes(kw) || reply.includes(kw));

  // Regex to match <!-- SAVE_SUGGESTION: {...} -->
  const suggestionRegex = /<!--\s*SAVE_SUGGESTION:\s*({[\s\S]*?})\s*-->/i;
  const match = reply.match(suggestionRegex);

  let replyWithoutMetadata = reply;
  let llmSuggested = false;
  let category: KnowledgeCategory = "misc";
  let slug = "";
  let importance: 1 | 2 | 3 = 1;

  if (match) {
    try {
      const jsonStr = match[1];
      const data = JSON.parse(jsonStr);

      llmSuggested = !!data.suggestSave;
      if (data.category && VALID_CATEGORIES.includes(data.category)) {
        category = data.category as KnowledgeCategory;
      }
      if (data.slug) {
        slug = toSlug(data.slug);
      }
      if (data.importance === 1 || data.importance === 2 || data.importance === 3) {
        importance = data.importance as (1 | 2 | 3);
      }

      // Remove the comment metadata tag from the final output reply text
      replyWithoutMetadata = reply.replace(suggestionRegex, "").trim();
    } catch (e) {
      console.error("[DEBUG] Failed to parse SAVE_SUGGESTION JSON:", e);
    }
  }

  // Hybrid precheck logic: Override LLM suggestion if keyword rule precheck matched
  let finalSuggestSave = llmSuggested;
  if (!llmSuggested && ruleMatched) {
    finalSuggestSave = true; // Fallback rule-based override trigger
  }

  // Fallback slug generation
  if (finalSuggestSave && !slug) {
    // Generate a quick fallback slug from first part of message
    const cleanWord = message.replace(/[^\w\s\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\-]/g, "");
    slug = toSlug(cleanWord.slice(0, 15)) || "chat-summary";
  }

  return {
    suggestSave: finalSuggestSave,
    category,
    slug,
    importance,
    replyWithoutMetadata,
  };
}
