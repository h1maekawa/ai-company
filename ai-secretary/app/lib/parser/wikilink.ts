const LINK_KEYWORDS = [
  "営業戦略",
  "学生集客",
  "就活",
  "DMMジオブースト",
  "ドコモ採用",
  "第二新卒",
  "投資戦略",
  "ARM株",
  "MeRaiseキャリア",
];

/**
 * Automatically wraps predefined keywords inside Obsidian double brackets [[keyword]]
 * while preventing double-wrapping if already linked.
 */
export function applyWikiLinks(text: string): string {
  if (!text) return "";

  let result = text;

  for (const keyword of LINK_KEYWORDS) {
    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    
    // Match keyword NOT preceded by '[[' and NOT followed by ']]'
    const regex = new RegExp(`(?<!\\[\\[)${escapedKeyword}(?!\\]\\])`, "g");
    
    result = result.replace(regex, `[[${keyword}]]`);
  }

  return result;
}
