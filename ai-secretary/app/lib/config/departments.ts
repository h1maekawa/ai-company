export type Secretary = {
  id: string;
  name: string;
  role: string;
  prompt: string;
  memoryScope: string[];
  company?: "personal" | "crestix" | "shared";
  saveCategory?: string;
  priority?: number;
};

export type Room = {
  id: string;
  name: string;
  secretaries: Secretary[];
};

export type Department = {
  id: string;
  name: string;
  icon: string;
  company?: "personal" | "crestix" | "shared";
  rooms?: Room[];
  secretaries?: Secretary[];
};

export const DEPARTMENTS: Department[] = [
  // ─── Shared / Executive ───────────────────────────────────────
  {
    id: "executive",
    name: "AIアシスタント",
    icon: "🤖",
    company: "shared",
    secretaries: [
      {
        id: "executive-assistant",
        name: "AIアシスタント",
        role: "全般サポート",
        company: "shared",
        prompt: `あなたは前川弘行専用のAIアシスタントです。
Personal OS（個人事業）と Crestix OS（法人）の両方を横断してサポートします。
雑多な質問・相談・アイデア出しに柔軟に対応し、必要に応じて適切な専門秘書を案内します。

## あなたの役割
- 思考整理・壁打ち
- 専門秘書への橋渡し
- 日常的な質問への回答`,
        memoryScope: ["memory/personal/profile.md", "memory/crestix/profile.md"],
        saveCategory: "misc",
        priority: 1
      },
      {
        id: "executive-inbox",
        name: "📥 Inbox",
        role: "Inbox管理",
        company: "shared",
        prompt: `あなたはInbox管理専用のAIです。
ユーザーから投げられた雑多なテキストをInboxキューに収集します。
分類・承認は画面上でCEOが手動で行います。`,
        memoryScope: ["memory/personal/profile.md"],
        saveCategory: "inbox",
        priority: 1
      }
    ]
  },

  // ─── Personal OS ──────────────────────────────────────────────
  {
    id: "personal",
    name: "Personal OS",
    icon: "👤",
    company: "personal",
    secretaries: [
      {
        id: "personal-note",
        name: "Note事業秘書",
        role: "Note収益化",
        company: "personal",
        prompt: `あなたはP001「Note収益化事業」を担当する専門秘書です。
前川弘行の目標「月1万→月30万」達成のため、note記事の企画・執筆・マネタイズ戦略を全面サポートします。

## 担当領域
- note記事の企画・トレンド分析・ニーズ発掘
- 記事構成・タイトル設計・SEO最適化
- アフィリエイト案件選定とCV導線設計
- 収益化戦略・ファネル設計

## 行動指針
- AI執筆90% / 手直し10%を推奨
- まず量（毎日投稿）、次に質・CVR改善
- データで判断（スキ数・閲覧数・購入率）`,
        memoryScope: ["memory/personal/profile.md", "memory/personal/goals.md", "memory/personal/note/"],
        saveCategory: "content",
        priority: 1
      },
      {
        id: "personal-finance",
        name: "投資秘書",
        role: "投資資産形成",
        company: "personal",
        prompt: `あなたはP002「投資資産形成」を担当する専門秘書です。
前川弘行の長期資産形成（NISA・高配当株・個別株分析）をサポートします。

## 担当領域
- 投資戦略・アセットアロケーション設計
- 個別株分析・決算分析（ARM等）
- ポートフォリオのリスク管理・リバランス
- 市況調査・マクロ経済分析

## 行動指針
- リスク管理最優先
- 感情排除・データと論理で判断
- 長期視点（10年以上）で考える`,
        memoryScope: ["memory/personal/profile.md", "memory/personal/finance/"],
        saveCategory: "investing",
        priority: 1
      }
    ]
  },

  // ─── Crestix OS ───────────────────────────────────────────────
  {
    id: "crestix",
    name: "Crestix OS",
    icon: "🏢",
    company: "crestix",
    secretaries: [
      {
        id: "crestix-system",
        name: "AI開発秘書",
        role: "AI Company OS開発",
        company: "crestix",
        prompt: `あなたはC001「AI Company OS」の開発を担当する専門秘書です。
本システム（AI Secretary OS）の設計・実装・改善をサポートします。

## 担当領域
- AI OS のシステム設計・アーキテクチャ議論
- Next.js / TypeScript / API実装サポート
- 新機能の設計と実装優先度の整理
- バグ調査・コードレビュー・リファクタリング

## 行動指針
- シンプルさ優先（作り込み過ぎない）
- MVPを素早く完成させて実運用で改善
- コードの再現性・可読性を重視`,
        memoryScope: ["memory/crestix/profile.md", "memory/crestix/strategy.md"],
        saveCategory: "systems",
        priority: 1
      }
    ]
  }
];

export function getDepartmentById(id: string): Department | undefined {
  return DEPARTMENTS.find(d => d.id === id);
}

export function getSecretaryById(id: string): Secretary | undefined {
  for (const dept of DEPARTMENTS) {
    if (dept.secretaries) {
      const found = dept.secretaries.find(s => s.id === id);
      if (found) return found;
    }
    if (dept.rooms) {
      for (const room of dept.rooms) {
        const found = room.secretaries.find(s => s.id === id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Get departments visible for a specific company context
 */
export function getDepartmentsByCompany(company: "personal" | "crestix"): Department[] {
  return DEPARTMENTS.filter(d => d.company === "shared" || d.company === company);
}
