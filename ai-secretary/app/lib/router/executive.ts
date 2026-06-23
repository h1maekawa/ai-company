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
export async function routeRequest(message: string, activeCompany: "personal" | "company"): Promise<RoutingResult> {
  const dbCompany = activeCompany === "company" ? "crestix" : "personal";
  const filteredSecretaries = Object.values(SECRETARY_REGISTRY).filter(sec => {
    return sec.config.company === "shared" || sec.config.company === dbCompany;
  });

  const registryList = filteredSecretaries.map(sec => {
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
1. 曖昧な質問や、特定の部署に当てはまらない一般的な壁打ちは "executive-assistant" に割り当ててください。
2. 投資やアセットアロケーション、ポートフォリオ、決算、保有ポジションは "personal-finance" または "personal-fund" 関連の秘書に割り当ててください。

3. 習慣・健康・個人的なToDo管理は "personal" 関連の秘書に割り当ててください。
4. noteの記事企画、キーワードリサーチ、構成、執筆、マーケティング、販売導線、下書き作成は "personal-note" 秘書に割り当ててください。
5. Crestixの営業、DMM営業、採用、顧客CRMは "crestix-system" または "crestix-ceo" に割り当ててください。
6. システム開発、Obsidian環境、自動化は "crestix-system" に割り当ててください。
7. 以下のいずれかに該当する場合は "personal-fund" に割り当ててください（confidence: 0.95）：
   - /fund-review, /market-scan, /earnings-check, /rotation-check, /buy-signal, /sell-signal, /risk-check, /portfolio-review, /fund-heatmap のいずれかのコマンドが含まれる
   - 「買いシグナル」「売りシグナル」「利確」「損切り」「押し目」「監視銘柄」「ウォッチリスト」「投資判断」「ファンド」「Fund」「ポジション」が含まれる
   - 特定銘柄（NVDA, MU, AMD, AVGO, TSM, ASML, VRT, ETN, PWR, KO 等）の売買判断・分析を求めている
   - 「ポートフォリオレビュー」「資産配分」「コア資産」「サテライト」「ヒートマップ」の話題
8. 以下のいずれかに該当する場合は "personal-note" に割り当ててください（confidence: 0.95）：
   - /note-research, /note-title, /note-outline, /note-draft, /note-post-plan, /note-kpi, /note-affili, /note-paid のいずれかのコマンドが含まれる
   - 「note執筆」「note構成」「note下書き」「noteネタ」「バズり導入文」「CTAテンプレート」等の話題
9. 以下のいずれかに該当する場合は "personal-ceo" に割り当ててください（confidence: 0.95）：
   - 個人事業全体の統括、リソース配分、アテンション管理、優先順位決定、集中事業の決定に関する話題
   - 「個人CEO」「Personal CEO」「事業横断」「リソース最適化」などの文脈
10. 以下のいずれかに該当する場合は "crestix-ceo" に割り当ててください（confidence: 0.95）：
    - Crestix（法人）の中長期戦略、サービス開発、アライアンス、経営判断に関する話題
    - 「Crestix CEO」「法人経営」「経営上の意思決定」などの文脈
11. 以下のいずれかに該当する場合は "personal-morning" に割り当ててください（confidence: 0.95）：
    - /morning-report コマンドが含まれる
    - 「朝会」「モーニングレポート」「今日のやること」「日次タスク」「日次オペレーション」に関する話題
12. 以下のいずれかに該当する場合は "hd-ceo" に割り当ててください（confidence: 0.95）：
    - HD Business全体の統括・今月着地・売上サマリーに関する話題
    - 「HD CEO」「HD事業部全体」「今月着地」「売上サマリー」などの文脈
13. 以下のいずれかに該当する場合は "hd-kpi-manager" に割り当ててください（confidence: 0.95）：
    - /hd-report, /hd-sim のいずれかのコマンドが含まれる
    - 「KPI逆算」「KPIシミュレーション」「今日の架電数」「架電目標」「転換率」「アポ率」「受注率」「KPI達成」などの文脈
14. 以下のいずれかに該当する場合は "hd-pipeline-manager" に割り当ててください（confidence: 0.95）：
    - /hd-pipeline, /hd-priority のいずれかのコマンドが含まれる
    - 「パイプライン」「案件進捗」「高確度案件」「滞留案件」「案件一覧」「今月着地案件」などの文脈
15. 以下のいずれかに該当する場合は "hd-closing-manager" に割り当ててください（confidence: 0.95）：
    - /hd-close コマンドが含まれる
    - 「クロージング」「今月間に合う商材」「高確度クロージング」「受注確定」「S案件」「A案件クロージング」などの文脈
16. 以下のいずれかに該当する場合は "hd-improvement-manager" に割り当ててください（confidence: 0.95）：
    - /hd-bottleneck コマンドが含まれる
    - 「ボトルネック」「改善策」「最弱KPI」「営業改善」「スクリプト改善」「転換率改善」などの文脈

## 信頼度 (confidence) 計算ルール
- ユーザーの意図が特定の秘書と100%合致し、明瞭に指定されている場合: 0.8〜1.0
- 複数の秘書にまたがる可能性があるか、意図が少しぼやけているが推測可能な場合: 0.5〜0.79
- 非常に曖昧で、何のコンテキストも特定できない場合: 0.49以下

## 返答フォーマット (厳守)
必ず以下のJSONフォーマットのみを返してください。余計なマークダウンや説明は一切含めないでください。
{
  "intent": "ユーザーの意図（日本語）",
  "department": "所属部門（例: personal, crestix, executive）",
  "room": "所属室（ある場合のみ、例: personal-fund-room。ない場合は空文字列にするか省略）",
  "secretary": "秘書ID（例: personal-ceo, personal-morning, personal-note, personal-fund, crestix-ceo）",
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

  // Fallback to assistant
  return {
    intent: "一般的な壁打ち・タスク整理",
    department: "executive",
    secretary: "executive-assistant",
    confidence: 0.3
  };
}

