/**
 * AI Company のフロント情報設計（Navigation v3）の唯一の定義。
 *
 * 方針:
 * - ユーザーに「どの部署か」を考えさせない。日常は4入口だけで完結させる。
 * - Backend の Department 構造（app/lib/config/hub.ts）は維持し、
 *   ここでは「表に出す入口」だけを決める。
 * - 既存 route は壊さない。UI から隠す場合も Deep Link は生かす。
 *
 * Sidebar / モバイル下部ナビ / ホームのQuick Action / 管理画面は
 * すべてこのファイルを参照する（ナビ定義をコンポーネント側に散らさない）。
 */

export type AppNavItem = {
  id: string;
  label: string;
  /** Sidebarと下部ナビで共有する絵文字アイコン */
  icon: string;
  href: string;
  /** 「ここで何ができるか」を1行で。管理画面とホームで表示する */
  description: string;
};

export const DEPARTMENT_IDS = ["creator", "fund", "operations", "knowledge", "planning", "engineering"] as const;
export type NavigationDepartmentId = typeof DEPARTMENT_IDS[number];

export type DepartmentNavItem = AppNavItem & {
  id: NavigationDepartmentId;
  detailHref: string;
  secretaryId?: string;
  homeMetrics: string[];
  employeeIds: string[];
};

/** Departmentの人間向け表示と入口の唯一の定義。内部IDは変更しない。 */
export const DEPARTMENT_NAV: DepartmentNavItem[] = [
  { id: "creator", label: "コンテンツ", icon: "✍️", href: "/ceo/departments/creator", detailHref: "/content", secretaryId: "personal-note", employeeIds: ["personal-note", "creator-content", "creator-research", "creator-kpi"], homeMetrics: ["x_impressions", "revenue"], description: "投稿とコンテンツ運用を見る" },
  { id: "fund", label: "投資", icon: "📈", href: "/ceo/departments/fund", detailHref: "/investing", secretaryId: "personal-fund", employeeIds: ["personal-fund", "fund-research"], homeMetrics: ["portfolio_value", "unrealized_pl", "thesis_alerts"], description: "資産と投資判断を見る" },
  { id: "operations", label: "AI Company", icon: "⚙️", href: "/ceo/departments/operations", detailHref: "/company", secretaryId: "executive-kaizen", employeeIds: ["executive-kaizen"], homeMetrics: ["automation", "intervention"], description: "自動化と会社の状態を見る" },
  { id: "knowledge", label: "知識", icon: "🧠", href: "/ceo/departments/knowledge", detailHref: "/knowledge", secretaryId: "executive-inbox", employeeIds: ["executive-inbox"], homeMetrics: ["total", "pending"], description: "Knowledgeと確認待ちを見る" },
  { id: "planning", label: "計画", icon: "🌅", href: "/ceo/departments/planning", detailHref: "/planning", secretaryId: "personal-morning", employeeIds: ["personal-morning"], homeMetrics: ["today_tasks", "blocked"], description: "今日のTaskと予定を見る" },
  { id: "engineering", label: "開発", icon: "💻", href: "/ceo/departments/engineering", detailHref: "/admin", secretaryId: "executive-assistant", employeeIds: ["executive-assistant"], homeMetrics: ["pr_ready", "blocked"], description: "Issue・PR・CIを見る" },
];

export const DEPARTMENT_NAV_BY_ID = Object.fromEntries(
  DEPARTMENT_NAV.map((item) => [item.id, item]),
) as Record<NavigationDepartmentId, DepartmentNavItem>;

/** Knowledgeは全社共有基盤でありDepartmentではない。互換routeはDEPARTMENT_NAVに残す。 */
export const BUSINESS_DEPARTMENT_IDS = ["creator", "fund", "operations", "planning", "engineering"] as const;
export const BUSINESS_DEPARTMENT_NAV = DEPARTMENT_NAV.filter(
  (item) => item.id !== "knowledge",
);
export const KNOWLEDGE_NAV: AppNavItem = {
  id: "knowledge",
  label: "Knowledge",
  icon: "🧠",
  href: "/knowledge",
  description: "全事業部が参照する会社の共有知識",
};
/** Pixel Officeの社員カードからDepartmentへ移動するための表示専用mapping。 */
export const AGENT_DEPARTMENT_HREF: Record<string, string> = {
  "personal-note": DEPARTMENT_NAV_BY_ID.creator.href,
  "creator-content": DEPARTMENT_NAV_BY_ID.creator.href,
  "creator-research": DEPARTMENT_NAV_BY_ID.creator.href,
  "creator-kpi": DEPARTMENT_NAV_BY_ID.creator.href,
  "personal-fund": DEPARTMENT_NAV_BY_ID.fund.href,
  "fund-research": DEPARTMENT_NAV_BY_ID.fund.href,
  "executive-kaizen": DEPARTMENT_NAV_BY_ID.operations.href,
  "executive-inbox": DEPARTMENT_NAV_BY_ID.knowledge.href,
  "personal-morning": DEPARTMENT_NAV_BY_ID.planning.href,
  "executive-assistant": "/chat?node=assistant",
};

/** Desktop Sidebar / Mobile Bottom Navigationで共有する日常の3入口。 */
export const PRIMARY_NAV: AppNavItem[] = [
  {
    id: "home",
    label: "ホーム",
    icon: "⌂",
    href: "/",
    description: "今見る必要があること",
  },
  {
    id: "today",
    label: "今日",
    icon: "🌅",
    href: "/planning",
    description: "今何をするかを決める",
  },
  {
    id: "work",
    label: "仕事",
    icon: "▦",
    href: "/ceo/work",
    description: "領域ごとの詳細を見る",
  },
];

/** 日常ではない管理系のまとめ入口。Sidebar下部に1つだけ出る。 */
export const ADMIN_NAV: AppNavItem = {
  id: "admin",
  label: "設定",
  icon: "⚙",
  href: "/admin",
  description: "Knowledge・接続・改善・詳細設定",
};

/** /admin の中身。毎日使う場所ではないので、ここへ寄せる。 */
export const ADMIN_SECTIONS: { label: string; items: AppNavItem[] }[] = [
  {
    label: "会社の記憶",
    items: [
      {
        id: "knowledge",
        label: "Knowledge",
        icon: "🧠",
        href: "/knowledge",
        description: "知識の検索・候補の採用/保留/却下・Vault確認",
      },
    ],
  },
  {
    label: "接続・システム",
    items: [
      {
        id: "system-map",
        label: "System Map",
        icon: "🗺",
        href: "/admin/system-map",
        description: "AI Company内の事業部・AI社員・データ・外部接続を見る",
      },
      {
        id: "connections",
        label: "接続状態",
        icon: "🔌",
        href: "/connections",
        description: "Buffer・SerpAPI・GitHub・Supabaseなどの接続確認",
      },
      {
        id: "content-settings",
        label: "コンテンツ設定",
        icon: "🎛",
        href: "/note/settings",
        description: "運用モード・ブランド・接続・詳細設定",
      },
      {
        id: "investing-settings",
        label: "投資設定",
        icon: "🧮",
        href: "/investing/settings",
        description: "投資判断エンジンの設定・データ取込",
      },
    ],
  },
  {
    label: "AI Company自体",
    items: [
      {
        id: "kaizen",
        label: "AI Company改善",
        icon: "💡",
        href: "/chat?node=kaizen",
        description: "この会社自体の改善提案をレビュー・追加する",
      },
      {
        id: "grill",
        label: "壁打ち",
        icon: "🔥",
        href: "/grill",
        description: "論点を分解して意思決定を詰める",
      },
    ],
  },
  {
    label: "パーソナル",
    items: [
      {
        id: "kakei",
        label: "家計",
        icon: "💰",
        href: "/chat?node=kakei",
        description: "収支管理・予算の相談",
      },
    ],
  },
  {
    label: "詳細・分析",
    items: [
      {
        id: "content-detail",
        label: "コンテンツ詳細分析",
        icon: "📊",
        href: "/content",
        description: "Performance・Revenue・Learnings・素材の細かい管理",
      },
      {
        id: "weekly-review",
        label: "週次レビュー",
        icon: "🗓",
        href: "/weekly-review",
        description: "1週間の振り返り",
      },
    ],
  },
];

export type QuickAction = {
  id: string;
  label: string;
  icon: string;
  href: string;
  hint: string;
  /** 最初に押してほしい導線を強調する */
  primary?: boolean;
};

/** ホームの「まず何をするか」。部署名ではなく動詞で並べる。 */
export const QUICK_ACTIONS: QuickAction[] = [
  { id: "ask", label: "秘書に相談", icon: "🤖", href: "/chat?node=assistant", hint: "やりたいことを話すだけ", primary: true },
  { id: "today", label: "今日を整理", icon: "🌅", href: "/planning", hint: "やることと時間割" },
  { id: "write", label: "投稿を作る", icon: "✍️", href: "/note", hint: "X・noteの下書き" },
  { id: "invest", label: "投資を見る", icon: "📈", href: "/investing", hint: "保有とニュース" },
  { id: "grill", label: "壁打ちする", icon: "🔥", href: "/grill", hint: "考えを詰める" },
];

/**
 * UIから外したが Deep Link としては生かし続ける route。
 * ここに載っているものは消さない（tests/architecture/navigation.test.mjs が固定する）。
 */
export const PRESERVED_ROUTES: { href: string; reason: string }[] = [
  { href: "/note", reason: "コンテンツの既存入口" },
  { href: "/content", reason: "Content Business OS。コンテンツ詳細分析として管理配下から到達する" },
  { href: "/investing", reason: "投資専用Shell" },
  { href: "/company", reason: "Simple Pixel Office・AI社員・Mission" },
  { href: "/knowledge", reason: "管理 → Knowledge" },
  { href: "/planning", reason: "トップレベル「今日」" },
  { href: "/chat", reason: "Global AI・各部署チャット" },
  { href: "/ceo/actions", reason: "Work / Global AIから到達するQuick Action" },
  { href: "/ceo/approvals", reason: "承認がある時だけHomeから到達する" },
  { href: "/ceo/departments/*", reason: "各Departmentの詳細Deep Link" },
  { href: "/connections", reason: "管理 → 接続状態" },
  { href: "/admin", reason: "日常外の設定を集約" },
  { href: "/admin/system-map", reason: "管理 → 接続・システム → System Map" },
  { href: "/weekly-review", reason: "管理から到達する週次レビュー" },
  { href: "/grill", reason: "ホームQuick Action・秘書・管理から到達する" },
];

/** pathname がそのナビ項目に属するか（?query は無視する） */
export function isNavActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
