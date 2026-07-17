import { getVaultFile, saveVaultFile } from "../vault";

/**
 * 改善提案（KAIZEN）の蓄積。
 *
 * 各秘書は会話中にAI会社自体の改善点に気づいたら返答末尾に
 * [KAIZEN]...[/KAIZEN] ブロックを出力する（api/chat が抽出）。
 * ここでは抽出済みの提案を memory/kaizen/YYYY-MM-DD.md に日次で追記する。
 * 蓄積された提案は executive-kaizen 秘書の memoryScope から読み込まれ、
 * 優先順位付け・集約レビューに使われる。
 */

export const KAIZEN_PROMPT_INSTRUCTION = `

---
## 改善提案（全秘書共通ルール）
あなたは「AI Company」システムの一員です。会話の中で、このAI会社自体を
より良くできる点（不足している機能・情報、繰り返し発生する手間、
プロンプトや事業部構成の改善余地など）に気づいた場合のみ、
返答の最後に以下の形式で1件だけ簡潔に提案してください（毎回は不要）:

[KAIZEN]
提案: （1〜2文で具体的に）
理由: （なぜそう思ったか1文）
[/KAIZEN]

会話への回答自体はこのブロックの外に通常どおり書いてください。`;

const KAIZEN_REGEX = /\[KAIZEN\]([\s\S]*?)\[\/KAIZEN\]/;

/**
 * 返答から [KAIZEN] ブロックを抽出し、本文と分離して返す。
 */
export function extractKaizen(reply: string): { reply: string; kaizen: string | null } {
  const match = reply.match(KAIZEN_REGEX);
  if (!match) return { reply, kaizen: null };
  return {
    reply: reply.replace(KAIZEN_REGEX, "").trim(),
    kaizen: match[1].trim(),
  };
}

/**
 * 提案を日次ログに追記保存する（失敗しても呼び出し側を落とさないこと）。
 */
export async function saveKaizenLog(
  secretaryId: string,
  proposal: string,
  userMessage: string
): Promise<void> {
  const now = new Date();
  const dateHyphen = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const path = `memory/kaizen/${dateHyphen}.md`;

  const entry = [
    ``,
    `## ${secretaryId} (${now.toISOString().slice(11, 16)})`,
    `**きっかけ:** ${userMessage.substring(0, 120)}`,
    proposal,
    `- [ ] 対応済み`,
  ].join("\n");

  let content = "";
  let sha: string | undefined;
  try {
    const file = await getVaultFile(path);
    if (file.content && file.sha) {
      content = file.content.trim() + "\n" + entry;
      sha = file.sha;
    }
  } catch {
    // 当日ファイルが未作成なら新規作成
  }

  if (!content) {
    content = `# 改善提案ログ ${dateHyphen}\n${entry}`;
  }

  await saveVaultFile(path, content, sha);
}
