/**
 * チャットの指示 → 専門エージェントへの振り分け — 要件1
 *
 * 既存の Executive Router は「どの秘書が答えるか」を決める。
 * ここはその手前で「これは実行を伴う指示か、ただの相談か」を判定し、
 * 実行を伴うものだけをタスク化する。
 *
 * 決定論的に判定する理由:
 *   ここでAIに判定させると、同じ指示が日によって別の役割へ流れる。
 *   タスクの生成は副作用（承認フィードに項目が増える）を伴うので、
 *   再現しない振り分けは運用上の事故になる。
 */

import { AgentRole, AgentTask, createAgentTask } from "./types";

/**
 * 役割ごとの発火語。上から順に評価し、最初に当たったものを採る。
 * 順序が振り分け結果を決めるため、変更したら回帰テストで固定すること。
 */
const ROLE_TRIGGERS: { role: AgentRole; verbs: RegExp; nouns?: RegExp }[] = [
  // 投稿は最も影響が大きいので先に判定する
  {
    role: "publisher",
    verbs: /(投稿|公開|予約|出して|アップ)(して|する|しといて|お願い)?/,
  },
  {
    role: "seo",
    verbs: /(seo|タイトル|見出し|タグ|検索)/i,
  },
  {
    role: "writer",
    verbs: /(書いて|執筆|下書き|原稿|記事に(して|する))/,
  },
  {
    role: "fact_check",
    verbs: /(裏取り|ファクト|事実確認|裏付け|検証して|ソース(を)?(確認|探))/,
  },
  {
    role: "market",
    verbs: /(調べて|リサーチして|探して|見つけて)/,
    nouns: /(a8|案件|アフィリ|市況|相場|単価|報酬)/i,
  },
  {
    role: "research",
    verbs: /(調べて|リサーチして|探して|集めて|ネタ|トレンド|候補)/,
  },
];

/** 実行を伴わない相談・質問。タスク化しない */
const CONVERSATIONAL = [
  /どう思う/,
  /^なぜ/,
  /どういう(意味|こと)/,
  /教えて$/,
  /とは[？?]?$/,
  /相談/,
];

export type DispatchResult =
  | { dispatched: true; role: AgentRole; task: AgentTask }
  | { dispatched: false; reason: string };

/**
 * 指示から役割を判定する。該当しなければ null（＝タスク化しない）。
 * 「調べて」のように複数の役割にまたがる語は、
 * 名詞側（A8・案件・市況など）で market と research を分ける。
 */
export function detectRole(message: string): AgentRole | null {
  const text = message.trim();
  if (!text) return null;
  if (CONVERSATIONAL.some((pattern) => pattern.test(text))) return null;

  for (const trigger of ROLE_TRIGGERS) {
    if (!trigger.verbs.test(text)) continue;
    if (trigger.nouns && !trigger.nouns.test(text)) continue;
    return trigger.role;
  }
  return null;
}

/**
 * チャット1件をタスクへ変換する。
 * 相談・質問はタスクにせず、チャットの返答だけで完結させる。
 */
export function dispatchFromChat(input: {
  message: string;
  intent: string;
  secretaryId: string;
  now?: Date;
}): DispatchResult {
  const role = detectRole(input.message);
  if (!role) {
    return { dispatched: false, reason: "実行を伴う指示ではないためタスク化しません" };
  }

  const now = input.now ?? new Date();
  return {
    dispatched: true,
    role,
    task: createAgentTask({
      role,
      instruction: input.message.trim(),
      intent: input.intent,
      sourceChat: {
        secretaryId: input.secretaryId,
        message: input.message.trim().slice(0, 200),
        at: now.toISOString(),
      },
      now,
    }),
  };
}
