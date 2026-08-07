import { SecretaryMode } from "./modes";

/**
 * ブレインストーミング型ホーム（マインドマップハブ）のノード定義。
 * 中央の秘書ノードから各事業部ノードが派生し、タップすると
 * その事業部の秘書に直結したチャット (/chat?node=<id>) が開く。
 *
 * secretaryId は app/lib/config/departments.ts のレジストリIDと一致させること。
 */
export type HubGroup = "personal" | "company" | "shared";

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
  /** マップ上の大別: 個人事業部 / 会社事業部 / 共通 */
  group: HubGroup;
  /**
   * 専用画面を持つ部署はここにパスを入れる（未指定なら /chat?node=<id> を開く）。
   * 例: Note事業部 → /note、朝会 → /planning
   */
  href?: string;
};

export const GROUP_LABELS: Record<HubGroup, { icon: string; name: string; color: string }> = {
  personal: { icon: "👤", name: "個人事業部", color: "#10b981" },
  company: { icon: "🏢", name: "会社事業部", color: "#8b5cf6" },
  shared: { icon: "🤝", name: "共通", color: "#64748b" },
};

export const CENTER_NODE: HubNode = {
  id: "assistant",
  group: "shared",
  secretaryId: "executive-assistant",
  icon: "🤖",
  name: "秘書",
  tagline: "専属秘書・唯一の窓口（各部署へ接続）",
  mode: "personal",
  color: "#2563eb",
  examples: [
    "今日やるべきことを整理して",
    "アイデアの壁打ちをしたい",
    "リソース配分を相談したい",
  ],
};

export const HUB_NODES: HubNode[] = [
  {
    id: "morning",
    group: "personal",
    secretaryId: "personal-morning",
    icon: "🌅",
    name: "朝会",
    tagline: "今日の行動設計・タイムブロッキング",
    mode: "personal",
    color: "#f59e0b",
    href: "/planning",
    examples: ["今日の朝会をはじめて", "/morning-report", "今日の優先タスクは？"],
  },
  {
    id: "note",
    group: "personal",
    secretaryId: "personal-note",
    icon: "📝",
    name: "Note事業",
    tagline: "Research・Viewpoint・確認できる下書き",
    mode: "note",
    color: "#10b981",
    href: "/note",
    examples: [
      "今日の記事を企画して",
      "新NISAでタイトル案を5つ出して",
      "今月の投稿計画を立てて",
    ],
  },
  {
    id: "fund",
    group: "personal",
    secretaryId: "personal-fund",
    icon: "📈",
    name: "投資・Fund",
    tagline: "AI投資パートナー・銘柄分析",
    mode: "finance",
    color: "#ef4444",
    href: "/investing",
    examples: [
      "ポートフォリオの現状を分析して",
      "/buy-signal NVDA",
      "/risk-check",
    ],
  },
  {
    id: "kakei",
    group: "personal",
    secretaryId: "personal-finance",
    icon: "💰",
    name: "家計",
    tagline: "収支管理・予算",
    mode: "personal",
    color: "#eab308",
    examples: ["今月の収支を整理したい", "固定費の見直しをしたい", "予算の相談"],
  },
  {
    id: "kaizen",
    group: "shared",
    secretaryId: "executive-kaizen",
    icon: "💡",
    name: "改善",
    tagline: "AI Company自体の継続的改善",
    mode: "personal",
    color: "#84cc16",
    examples: [
      "溜まっている改善提案をレビューして",
      "今週の改善トップ3は？",
      "このAI会社に足りない機能は？",
    ],
  },
];

/** そのノードを開くときのリンク先。専用画面があればそちら、なければチャット */
export function hubNodeHref(node: HubNode): string {
  return node.href ?? `/chat?node=${node.id}`;
}

export function findHubNode(id: string | null): HubNode | undefined {
  if (!id) return undefined;
  if (id === CENTER_NODE.id) return CENTER_NODE;
  return HUB_NODES.find((n) => n.id === id);
}
