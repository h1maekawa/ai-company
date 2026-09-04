import { SecretaryMode } from "./modes";

/**
 * 各部署（Department）の定義。Backend側の担当割り当てはこのIDで行う。
 *
 * 表に出すNavigationは app/lib/config/navigation.ts が決める。
 * ここに部署があっても、Sidebarへ出すとは限らない（ユーザーに部署を意識させないため）。
 * /chat?node=<id> のDeep Linkは、Sidebarに出していない部署でも生きている。
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
  tagline: "何でもここへ。必要な担当につなぎます",
  mode: "personal",
  color: "#2563eb",
  examples: [
    "今日何をすればいい？",
    "X投稿を作りたい",
    "NVDAどう？",
    "この設計を壁打ちしたい",
    "Knowledgeに保存して",
  ],
};

export const HUB_NODES: HubNode[] = [
  {
    id: "morning",
    group: "personal",
    secretaryId: "personal-morning",
    icon: "🌅",
    name: "今日",
    tagline: "今日やること・優先順位・時間割",
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
    name: "コンテンツ",
    tagline: "X・noteの作成から確認・成果まで",
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
    id: "content",
    group: "personal",
    secretaryId: "personal-note",
    icon: "🧭",
    name: "コンテンツ詳細分析",
    tagline: "投稿結果・売上・学びの記録（コンテンツの詳細画面）",
    mode: "note",
    color: "#22C55E",
    href: "/content",
    examples: [
      "今週のRevenueは？",
      "次の記事候補を見せて",
      "Weekly Reviewを見たい",
    ],
  },
  {
    id: "fund",
    group: "personal",
    secretaryId: "personal-fund",
    icon: "📈",
    name: "投資",
    tagline: "保有状況・ニュース・AI分析",
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
    id: "grill",
    group: "shared",
    secretaryId: "executive-assistant",
    icon: "🔥",
    name: "壁打ち",
    tagline: "論点分解→合意形成（Grilling）",
    mode: "personal",
    color: "#f97316",
    href: "/grill",
    examples: ["新しい企画を壁打ちしたい", "設計を詰めたい", "意思決定を整理したい"],
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
