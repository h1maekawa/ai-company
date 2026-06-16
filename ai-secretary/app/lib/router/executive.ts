import { callGroq } from "../ai/groq";
import { SECRETARY_REGISTRY } from "../config/registry";

export type RoutingResult = {
  intent: string;
  department: string;
  room?: string;
  secretary: string;
  confidence: number;
};

/**
 * Parses a user request and determines the optimal secretary to handle the message.
 * Assigns a confidence score to determine if routing should trigger automatically.
 */
export async function routeRequest(message: string): Promise<RoutingResult> {
  const registryList = Object.values(SECRETARY_REGISTRY).map(sec => {
    return {
      id: sec.config.id,
      name: sec.config.name,
      department: sec.departmentId,
      room: sec.roomId || "",
      description: sec.config.role + " - " + sec.config.prompt.substring(0, 80) + "..."
    };
  });

  const prompt = `あなたは「AI Company OS」の最高指令塔（Executive Router）です。
ユーザー（CEO）からのメッセージを分類し、どの部署・どの室・どの専門秘書にルーティングすべきかを決定してください。

## 秘書レジストリ情報
${JSON.stringify(registryList, null, 2)}

## ルーティング判定ルール
1. 曖昧な質問や、特定の部署に当てはまらない一般的な壁打ちは "executive-coo" に割り当ててください。
2. 投資やアセットアロケーション、ポートフォリオ、決算は "finance" 関連の秘書に割り当ててください。
3. 習慣・健康・個人的なToDo管理は "personal" 関連の秘書に割り当ててください。
4. noteの記事企画、キーワードリサーチ、構成、執筆、マーケティング、販売導線は "note" 関連の室・秘書に割り当ててください。
5. Crestixの営業、DMM営業、採用、顧客CRMは "company" 関連の秘書に割り当ててください。
6. システム開発、Obsidian環境、自動化は "system" 関連の秘書に割り当ててください。

## 信頼度 (confidence) 計算ルール
- ユーザーの意図が特定の秘書と100%合致し、明瞭に指定されている場合: 0.8〜1.0
- 複数の秘書にまたがる可能性があるか、意図が少しぼやけているが推測可能な場合: 0.5〜0.79
- 非常に曖昧で、何のコンテキストも特定できない場合: 0.49以下

## 返答フォーマット (厳守)
必ず以下のJSONフォーマットのみを返してください。余計なマークダウンや説明は一切含めないでください。
{
  "intent": "ユーザーの意図（日本語）",
  "department": "所属部門（例: note）",
  "room": "所属室（ある場合のみ、例: writing。ない場合は空文字列にするか省略）",
  "secretary": "秘書ID（例: note-writing-research）",
  "confidence": 0.0〜1.0の数値
}
`;

  try {
    const response = await callGroq(message, prompt);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as RoutingResult;
      if (SECRETARY_REGISTRY[parsed.secretary]) {
        return {
          intent: parsed.intent || "不明な意図",
          department: parsed.department,
          room: parsed.room || undefined,
          secretary: parsed.secretary,
          confidence: Number(parsed.confidence) || 0.5
        };
      }
    }
  } catch (e) {
    console.error("[DEBUG] Executive router failed to resolve:", e);
  }

  // Fallback to COO
  return {
    intent: "一般的な壁打ち・タスク整理",
    department: "executive",
    secretary: "executive-coo",
    confidence: 0.3
  };
}
