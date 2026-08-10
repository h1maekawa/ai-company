/**
 * Note ⇄ X Bridge。
 *
 * Note → X: 承認済み記事から、単純な要約ではなく複数の切り口でX下書きを作る。
 * X → Note: 反応の良かったXは PreviousContentProvider 経由でMaterial化し、
 *           通常のNote Studio（AI Interview）フローに載せる（ここでは変換ロジックのみ）。
 */

import { callAI as defaultCallAI } from "../../ai/client";
import { NoteArticleDraft, XDraftType } from "../../note/research/types";

export type AICaller = (message: string, systemPrompt: string) => Promise<string>;
const DEFAULT_DEPS = { callAI: (m: string, s: string) => defaultCallAI(m, s, { provider: "auto" }) };

/** Note → X で最低限提示する切り口（記事本文の単純短縮は禁止） */
export const NOTE_TO_X_CANDIDATE_TYPES: XDraftType[] = [
  "opinion",
  "experience",
  "learning",
  "how-to",
  "note-traffic",
];

const BRIDGE_SYSTEM_PROMPT = `note記事を元に、Xの投稿文を作ってください。
記事本文を単純に短縮するのではなく、指定された切り口（type）で書き直してください。
- opinion: 記事の主張だけを一言で
- experience: 記事内の体験部分だけを抜き出す
- learning: 記事から学んだことを1つに絞る
- how-to: 手順の一部だけを実践的に
- note-traffic: 続きは記事でと誘導する内容
出力は投稿文のみ（前置き不要、140字目安）。`;

export async function generateXFromNoteDraft(
  draft: Pick<NoteArticleDraft, "title" | "freeSection">,
  type: XDraftType,
  deps: { callAI: AICaller } = DEFAULT_DEPS
): Promise<string> {
  const message = `記事タイトル: ${draft.title}\n切り口(type): ${type}\n\n記事本文:\n${draft.freeSection.slice(0, 4000)}`;
  return (await deps.callAI(message, BRIDGE_SYSTEM_PROMPT)).trim();
}
