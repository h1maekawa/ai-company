import { callGroq } from "../ai/groq";
import { SECRETARY_REGISTRY } from "../config/registry";

/**
 * Operations Chief (COO) analyzes intent and assigns the best matching secretary.
 */
export async function assignSecretary(intent: string): Promise<string> {
  const registryInfo = Object.values(SECRETARY_REGISTRY).map(sec => {
    return `- ${sec.config.id}: ${sec.config.name} (${sec.config.role}) - ${sec.config.prompt}`;
  }).join("\n");

  const prompt = `あなたは「AI Company OS」のCOO（業務執行役員）です。
ユーザーの会話の意図（intent）に基づき、対応させるべき最も適切な専門秘書のIDを決定してください。

## 秘書一覧
${registryInfo}

## 決定ルール
必ず一致する秘書IDのみ（例: "note-monetize-funnel"）を返し、余計なマークダウン、二重引用符、改行、説明は一切含めないでください。`;

  try {
    const res = await callGroq(intent, prompt);
    const cleaned = res.trim().replace(/^["']|["']$/g, "");
    if (SECRETARY_REGISTRY[cleaned]) {
      return cleaned;
    }
  } catch (e) {
    console.error("[DEBUG] COO assignSecretary failed:", e);
  }
  return "executive-assistant"; // default fallback
}

/**
 * COO proposes a pipeline/sequence of secretary IDs to achieve the task.
 */
export async function assignPipeline(intent: string): Promise<string[]> {
  const registryInfo = Object.values(SECRETARY_REGISTRY).map(sec => {
    return `- ${sec.config.id}: ${sec.config.name}`;
  }).join("\n");

  const prompt = `あなたは「AI Company OS」のCOO（業務執行役員）です。
ユーザーの意図（intent）に基づいて、このタスクをやり遂げるために順次実行すべき「専門秘書IDのフロー（順番）」を決定してください。

## 秘書候補
${registryInfo}

返却例：["note-planning-trend", "note-planning-needs", "note-writing-structure", "note-writing-write", "note-monetize-funnel"]

必ず有効なJSON形式の配列のみを返し、余計な説明やマークダウンは含めないでください。`;

  try {
    const res = await callGroq(intent, prompt);
    const jsonMatch = res.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const arr = JSON.parse(jsonMatch[0]) as string[];
      return arr.filter(id => SECRETARY_REGISTRY[id]);
    }
  } catch (e) {
    console.error("[DEBUG] COO assignPipeline failed:", e);
  }
  return ["executive-assistant"];
}

