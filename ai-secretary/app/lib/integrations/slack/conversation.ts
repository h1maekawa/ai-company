export type ConversationIntent =
  | { type: "research"; topic?: string }
  | { type: "candidates" }
  | { type: "queue" }
  | { type: "draft" }
  | { type: "settings" }
  | { type: "publish" }
  | { type: "help" };

export function cleanSlackMessage(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/gi, "").replace(/\s+/g, " ").trim();
}

function researchTopic(text: string): string | undefined {
  const cleaned = text
    .replace(/(?:について|を)?(?:リサーチ|調査|検索|調べ)(?:して|て|たい|よう)?/g, "")
    .replace(/(?:最近の|いまの|今の|今日の|お願い|ください|教えて)/g, "")
    .replace(/[。、！？!?]/g, " ")
    .trim();
  return cleaned && cleaned.length <= 60 ? cleaned : undefined;
}

export function classifyConversation(text: string): ConversationIntent {
  const cleaned = cleanSlackMessage(text);
  if (/(公開|投稿)(して|する|お願い)/.test(cleaned)) return { type: "publish" };
  if (/(全文|原稿|記事|下書き).*(見せ|確認|開)|(?:見せ|確認).*(全文|原稿|記事|下書き)/.test(cleaned)) {
    return { type: "draft" };
  }
  if (/(候補|テーマ).*(見せ|確認)|(?:見せ|確認).*(候補|テーマ)/.test(cleaned)) return { type: "candidates" };
  if (/(キュー|予約|投稿予定|下書き一覧)/.test(cleaned)) return { type: "queue" };
  if (/(設定|自動投稿.*状態|安全装置)/.test(cleaned)) return { type: "settings" };
  if (/(リサーチ|調査|検索|調べ)/.test(cleaned)) return { type: "research", topic: researchTopic(cleaned) };
  return { type: "help" };
}
