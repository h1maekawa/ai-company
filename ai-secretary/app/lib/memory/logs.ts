import { generateUniqueId } from "../utils/id";
import { getVaultFile, saveVaultFile } from "../vault";
import { SecretaryMode } from "../config/modes";
import { callGroq } from "../ai/groq";
import { callGemini } from "../ai/gemini";
import { callOllama } from "../ai/ollama";

async function callLLM(message: string, systemPrompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    return callGroq(message, systemPrompt);
  } else if (process.env.GEMINI_API_KEY) {
    return callGemini(message, systemPrompt);
  } else {
    return callOllama(message, systemPrompt);
  }
}

/**
 * Summarizes the current conversation and appends or creates a daily log summary file.
 */
export async function saveChatLog(
  secretaryId: string,
  message: string,
  reply: string
): Promise<{ success: boolean; path: string; id: string }> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // 1. Generate Summary with LLM
  const systemPrompt = `あなたは優秀な秘書の記録係です。与えられたユーザーの質問とAI秘書の回答のやり取りを読み、簡潔な「会話要約」を作成してください。`;
  
  const userMsg = `以下のやり取りを要約してください。

【ユーザーの質問】
${message}

【AI秘書の回答】
${reply}

要約は必ず以下のマークダウン構成で出力してください。追加の解説や前置き、結びの言葉などは含めず、項目のみを出力してください。

## テーマ
(要約した簡潔なテーマを1行で)

## 結論
(今回のやり取りの結論を簡潔に)

## 重要論点
(議論された重要なポイントを箇条書きで)

## 次回アクション
(次に取るべき行動を箇条書きで)`;

  const summaryContent = await callLLM(userMsg, systemPrompt);

  // 2. Generate unique serial ID
  const id = await generateUniqueId("lg");

  const targetDir = `memory/chat-log/${secretaryId}`;
  const targetFilePath = `${targetDir}/${dateHyphen}-summary.md`;

  let finalContent = "";
  let existingSha: string | undefined = undefined;

  try {
    // Check if daily summary file already exists to append to it
    const file = await getVaultFile(targetFilePath);
    if (file.content && file.sha) {
      existingSha = file.sha;
      finalContent = `${file.content.trim()}

---
### 追加の会話要約 (ID: ${id})
${summaryContent.trim()}
`;
    }
  } catch (e) {
    // Expected when file does not exist yet for today
    console.log(`[DEBUG] No existing summary file for today. Creating a new one.`);
  }

  // Create new file if none exists
  if (!finalContent) {
    finalContent = `---
id: ${id}
type: chat_summary
secretaryId: ${secretaryId}
created: ${dateHyphen}
updated: ${dateHyphen}
---

# 会話要約 (ID: ${id})

${summaryContent.trim()}
`;
  }

  // Save / Overwrite vault file
  await saveVaultFile(targetFilePath, finalContent, existingSha);

  return {
    success: true,
    path: targetFilePath,
    id,
  };
}
