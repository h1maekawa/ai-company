/**
 * AI Company のフロント情報設計（Navigation v2）の唯一の定義。
 *
 * 方針:
 * - ユーザーに「どの部署か」を考えさせない。日常はトップ5領域だけで完結させる。
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

/** 日常利用する主要領域。Sidebar上部とモバイル下部ナビに出る。 */
export const PRIMARY_NAV: AppNavItem[] = [
  {
    id: "home",
    label: "ホーム",
    icon: "⌂",
    href: "/",
    description: "今の状況と、次にやることの入口",
  },
  {
    id: "assistant",
    label: "秘書",
    icon: "🤖",
    href: "/chat?node=assistant",
    description: "何でもここから依頼できる窓口",
  },
  {
    id: "today",
    label: "今日",
    icon: "🌅",
    href: "/planning",
    description: "今日やること・優先順位・時間割",
  },
  {
    id: "content",
    label: "コンテンツ",
    icon: "📝",
    href: "/note",
    description: "X・noteの作成から確認・成果まで",
  },
  {
    id: "investing",
    label: "投資",
    icon: "📈",
    href: "/investing",
    description: "保有状況・ニュース・AI分析",
  },
];

/** 日常ではない管理系のまとめ入口。Sidebar下部に1つだけ出る。 */
export const ADMIN_NAV: AppNavItem = {
  id: "admin",
  label: "管理",
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
  { href: "/content", reason: "Content Business OS。コンテンツ詳細分析として管理配下から到達する" },
  { href: "/knowledge", reason: "管理 → Knowledge" },
  { href: "/connections", reason: "管理 → 接続状態" },
  { href: "/grill", reason: "ホームQuick Action・秘書・管理から到達する" },
  { href: "/planning", reason: "トップレベル「今日」" },
  { href: "/note", reason: "トップレベル「コンテンツ」" },
  { href: "/investing", reason: "トップレベル「投資」" },
  { href: "/chat", reason: "秘書・各部署チャット（?node=assistant / kaizen / kakei ...）" },
];

/** pathname がそのナビ項目に属するか（?query は無視する） */
export function isNavActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
