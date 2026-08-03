export type ConversationIntent =
  | { type: "research"; topic?: string; destination: "x" | "note" | "both" }
  | {
      type: "generate";
      kind: "x" | "note" | "both";
      articleType: "free" | "paid";
      topic?: string;
      candidateNumber?: number;
    }
  | { type: "select"; candidateNumber: number }
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
    .replace(/(?:X|Twitter|ツイート|note|ノート)(?:投稿|記事|原稿)?(?:用|向け)?/gi, "")
    .replace(/(?:両方|どちらも|一緒に)/g, "")
    .replace(/(?:について|を)?(?:リサーチ|調査|検索|調べ)(?:して|て|たい|よう)?/g, "")
    .replace(/(?:最近の|いまの|今の|今日の|お願い|ください|教えて)/g, "")
    .replace(/[。、！？!?]/g, " ")
    .replace(/^(?:の|で|に)+|(?:の|で|に)+$/g, "")
    .trim();
  return cleaned && cleaned.length <= 60 ? cleaned : undefined;
}

function generationTopic(text: string): string | undefined {
  if (/(?:この|今の)(?:意見|考え|回答)/.test(text)) return undefined;
  const cleaned = text
    .replace(/(?:X|Twitter|ツイート|note|ノート)(?:投稿|記事|原稿|用)?/gi, "")
    .replace(/(?:無料|有料|両方|どちらも|一緒に)/g, "")
    .replace(/(?:の)?(?:下書き|投稿案|記事|文章|原稿|案)/g, "")
    .replace(/(?:を|で|について)?(?:作って|作成して|生成して|書いて|考えて|お願い)/g, "")
    .replace(/(?:一番上|1番目|2番目|3番目|4番目|5番目|最初|候補)/g, "")
    .replace(/(?:この|今の)?(?:意見|考え|回答)(?:を使って|で)?/g, "")
    .replace(/[。、！？!?]/g, " ")
    .replace(/^(?:の|で)+|(?:の|で)+$/g, "")
    .trim();
  return cleaned && cleaned.length <= 60 ? cleaned : undefined;
}

function candidateNumber(text: string): number | undefined {
  if (/(?:一番上|最初|1番目)/.test(text)) return 1;
  const match = text.match(/([2-5])番目/);
  return match ? Number(match[1]) : undefined;
}

export function classifyConversation(text: string): ConversationIntent {
  const cleaned = cleanSlackMessage(text);
  if (/(公開|投稿)(して|する|お願い)/.test(cleaned)) return { type: "publish" };
  if (
    /(?:X|Twitter|ツイート|note|ノート|両方)/i.test(cleaned) &&
    /(?:作って|作成して|生成して|書いて|考えて)/.test(cleaned)
  ) {
    const kind =
      /(?:両方|どちらも|Xとnote|noteとX)/i.test(cleaned)
        ? "both"
        : /(?:note|ノート)/i.test(cleaned)
          ? "note"
          : "x";
    return {
      type: "generate",
      kind,
      articleType: /有料/.test(cleaned) ? "paid" : "free",
      topic: generationTopic(cleaned),
      candidateNumber: candidateNumber(cleaned),
    };
  }
  const selectedNumber = candidateNumber(cleaned);
  if (
    selectedNumber &&
    /(?:気になる|選びたい|選ぶ|詳しく見たい|これにする|これがいい)/.test(cleaned)
  ) {
    return { type: "select", candidateNumber: selectedNumber };
  }
  if (/(全文|原稿|記事|下書き).*(見せ|確認|開)|(?:見せ|確認).*(全文|原稿|記事|下書き)/.test(cleaned)) {
    return { type: "draft" };
  }
  if (/(候補|テーマ).*(見せ|確認)|(?:見せ|確認).*(候補|テーマ)/.test(cleaned)) return { type: "candidates" };
  if (/(キュー|予約|投稿予定|下書き一覧)/.test(cleaned)) return { type: "queue" };
  if (/(設定|自動投稿.*状態|安全装置)/.test(cleaned)) return { type: "settings" };
  if (/(リサーチ|調査|検索|調べ)/.test(cleaned)) {
    const destination =
      /(?:両方|どちらも|Xとnote|noteとX)/i.test(cleaned)
        ? "both"
        : /(?:note|ノート)/i.test(cleaned)
          ? "note"
          : /(?:X|Twitter|ツイート)/i.test(cleaned)
            ? "x"
            : "both";
    return { type: "research", topic: researchTopic(cleaned), destination };
  }
  return { type: "help" };
}
