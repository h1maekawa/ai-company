import { callAI } from "../ai/client";
import { SECRETARY_REGISTRY } from "../config/registry";

export type InboxTask = {
  id: string;
  title: string;
  department: "personal" | "company" | "finance" | "note" | "system";
  suggestedSecretary?: string;
  confidence: number;
  reason: string;
};

export type InboxClassification = {
  rawInput: string;
  tasks: InboxTask[];
};

/**
 * Parses raw messy thoughts/inputs and classifies them into structured task nodes.
 */
export async function classifyInbox(input: string): Promise<InboxClassification> {
  const registryList = Object.values(SECRETARY_REGISTRY).map(sec => {
    return {
      id: sec.config.id,
      name: sec.config.name,
      department: sec.departmentId,
      room: sec.roomId || "",
      description: sec.config.role + " - " + sec.config.prompt.substring(0, 60) + "..."
    };
  });

  const prompt = `あなたは「AI Company OS」の思考整理コンシェルジュ（Inbox秘書）です。
ユーザーから投げられた雑多なアイデア、ToDo、メモ、指令のリストを解析し、個々の明確なタスクに分解した上で、適切な事業部および専門秘書に分類してください。

## 秘書レジストリ情報
${JSON.stringify(registryList, null, 2)}

## 分類先ルール
- **personal**: 習慣、健康、個人の今日のタスク、自己学習など。
- **company**: Crestix営業、採用、顧客CRM、DMM営業、提案資料など。
- **finance**: 投資戦略、市況分析（ARM株など）、ポートフォリオ、決算分析など。
- **note**: noteの企画、キーワード、勝ち筋、リサーチ、構成、執筆、SEO、SNS拡散、アフィリエイト、マネタイズなど。
- **system**: AI開発、Obsidian環境、自動化など。

## 出力JSONフォーマット
必ず以下のJSONフォーマットのみを返してください。説明文やマークダウンのコードブロック(\`\`\`)は一切含めないでください。

{
  "tasks": [
    {
      "title": "タスク内容（例: 投資教材の目次を作成する）",
      "department": "personal | company | finance | note | system",
      "suggestedSecretary": "推奨する秘書ID（例: note-monetize-product）",
      "confidence": 0.0〜1.0の数値（分類精度・信頼度）",
      "reason": "このタスクに分類した理由（日本語で1文程度）"
    }
  ]
}
`;

  try {
    const response = await callAI(input, prompt);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const tasks = (parsed.tasks || []).map((t: any, idx: number) => ({
        id: `ib-${Date.now()}-${idx}`,
        title: t.title || "無題のタスク",
        department: t.department || "personal",
        suggestedSecretary: t.suggestedSecretary || undefined,
        confidence: Number(t.confidence) || 0.5,
        reason: t.reason || ""
      }));

      return {
        rawInput: input,
        tasks
      };
    }
  } catch (e) {
    console.error("[DEBUG] Inbox classifier failed:", e);
  }

  // Fallback
  return {
    rawInput: input,
    tasks: [
      {
        id: `ib-${Date.now()}-0`,
        title: input.substring(0, 50),
        department: "personal",
        confidence: 0.3,
        reason: "解析に失敗したため、デフォルトでパーソナルに設定されました。"
      }
    ]
  };
}
