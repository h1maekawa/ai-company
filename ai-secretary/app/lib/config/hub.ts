import { SecretaryMode } from "./modes";

/**
 * ブレインストーミング型ホーム（マインドマップハブ）のノード定義。
 * 中央の秘書ノードから各事業部ノードが派生し、タップすると
 * その事業部の秘書に直結したチャット (/chat?node=<id>) が開く。
 *
 * secretaryId は app/lib/config/departments.ts のレジストリIDと一致させること。
 */
export type HubNode = {
  id: string;
  secretaryId: string;
  icon: string;
  name: string;
  tagline: string;
  /** /api/chat に渡す company コンテキスト用モード */
  mode: SecretaryMode;
  /** ノードのアクセントカラー (Tailwindではなく生CSS値。SVG線と共有するため) */
  color: string;
  examples: string[];
};

export const CENTER_NODE: HubNode = {
  id: "assistant",
  secretaryId: "executive-assistant",
  icon: "🤖",
  name: "AI秘書",
  tagline: "なんでも相談・自動振り分け",
  mode: "personal",
  color: "#2563eb",
  examples: [
    "今日やるべきことを整理して",
    "アイデアの壁打ちをしたい",
    "どの事業部に相談すべき？",
  ],
};

export const HUB_NODES: HubNode[] = [
  {
    id: "morning",
    secretaryId: "personal-morning",
    icon: "🌅",
    name: "朝会",
    tagline: "モーニングレポート・1日の計画",
    mode: "personal",
    color: "#f59e0b",
    examples: ["今日の朝会をはじめて", "/morning-report", "今日の優先タスクは？"],
  },
  {
    id: "note",
    secretaryId: "personal-note",
    icon: "📝",
    name: "Note事業",
    tagline: "note収益化・記事作成",
    mode: "note",
    color: "#10b981",
    examples: [
      "今日の記事を企画して",
      "新NISAでタイトル案を5つ出して",
      "今月の投稿計画を立てて",
    ],
  },
  {
    id: "fund",
    secretaryId: "personal-fund",
    icon: "📈",
    name: "投資・Fund",
    tagline: "銘柄分析・ポートフォリオ",
    mode: "finance",
    color: "#ef4444",
    examples: [
      "ポートフォリオの現状を分析して",
      "/buy-signal NVDA",
      "/risk-check",
    ],
  },
  {
    id: "kakei",
    secretaryId: "personal-finance",
    icon: "💰",
    name: "家計",
    tagline: "収支管理・予算",
    mode: "personal",
    color: "#eab308",
    examples: ["今月の収支を整理したい", "固定費の見直しをしたい", "予算の相談"],
  },
  {
    id: "company",
    secretaryId: "company-ceo",
    icon: "🏢",
    name: "経営戦略",
    tagline: "Crestix経営・KPI・意思決定",
    mode: "company",
    color: "#8b5cf6",
    examples: [
      "今期のKPIを整理して",
      "新規事業の論点を洗い出して",
      "意思決定の壁打ちをしたい",
    ],
  },
  {
    id: "dev",
    secretaryId: "company-system",
    icon: "🛠️",
    name: "AI開発",
    tagline: "AI Companyシステム開発",
    mode: "company",
    color: "#06b6d4",
    examples: [
      "次に実装すべき機能は？",
      "アーキテクチャの相談",
      "技術的負債の優先順位づけ",
    ],
  },
  {
    id: "hd",
    secretaryId: "hd-ceo",
    icon: "📊",
    name: "HD事業",
    tagline: "HDビジネス・営業パイプライン",
    mode: "company",
    color: "#ec4899",
    examples: ["KPIの進捗を確認したい", "パイプラインの状況は？", "クロージングの相談"],
  },
];

export function findHubNode(id: string | null): HubNode | undefined {
  if (!id) return undefined;
  if (id === CENTER_NODE.id) return CENTER_NODE;
  return HUB_NODES.find((n) => n.id === id);
}
