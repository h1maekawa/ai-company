import { generateUniqueId } from "../utils/id";
import { getVaultFile, saveVaultFile } from "../vault";

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

  // 1. ユーザー発言とAI返答をそのまま記録（LLM要約は廃止）
  const summaryContent = [
    `## ユーザー`,
    message.substring(0, 800),
    ``,
    `## AI秘書`,
    reply.substring(0, 1500),
  ].join("\n");

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
