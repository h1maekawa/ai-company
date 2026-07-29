/**
 * Note事業部のドメイン型。
 *
 * 位置づけ: 「副業で稼ぎたい人」に向けて教えるメディア事業。
 * 記事・X・公式LINEの3チャネルで集客し、有料コンテンツとアフィリエイトで収益化する。
 *
 * 収益を扱う題材なので、生成物には次の制約が常にかかる（prompts.ts参照）:
 *  - 実績のない収益額を書かない（景表法の優良誤認・有利誤認を避ける）
 *  - アフィリエイトを含む記事にはPR表記を必ず入れる（ステマ規制）
 *  - 前川さん自身がやっていないことを「やった」と書かない
 */

/** 記事のジャンル。アフィリエイト案件もここで紐付ける */
export type Genre = {
  id: string;
  label: string;
  /** どんな読者の、どんな悩みに向けたジャンルか */
  description: string;
  color: string;
};

export const DEFAULT_GENRES: Genre[] = [
  {
    id: "side-income",
    label: "副業の始め方",
    description: "これから副業を始める人が最初に詰まるところ",
    color: "#22c55e",
  },
  {
    id: "ai-work",
    label: "AI仕事術",
    description: "AIで作業を減らし、副業に使える時間を作る",
    color: "#4f8cff",
  },
  {
    id: "ai-career",
    label: "AIキャリア",
    description: "本業の市場価値を上げて収入の土台を作る",
    color: "#a78bfa",
  },
  {
    id: "build-in-public",
    label: "実践記録",
    description: "自分が実際に作った・試した過程をそのまま出す",
    color: "#f59e0b",
  },
  {
    id: "money",
    label: "お金の管理",
    description: "稼いだあとに残す・増やすところまで",
    color: "#eab308",
  },
];

/* ─── ネタ帳 ───────────────────────────────────────── */

export type IdeaStatus = "inbox" | "planned" | "drafted" | "published";

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: "ネタ",
  planned: "書く予定",
  drafted: "下書きあり",
  published: "公開済み",
};

export type Idea = {
  id: string;
  title: string;
  genreId: string;
  status: IdeaStatus;
  /** どこから拾ったネタか */
  source: "morning" | "manual" | "chat";
  /** 朝会由来なら、その日付と元タスク名 */
  sourceDate?: string;
  sourceTask?: string;
  /** 読者が得られること（AIが記事化するときの軸） */
  takeaway?: string;
  memo?: string;
  createdAt: string;
};

/* ─── アフィリエイト ───────────────────────────────── */

/**
 * アフィリエイト案件。APIで取れないため手入力で管理する。
 * URLは前川さんが貼り付けたものだけを使い、生成AIには作らせない。
 */
export type AffiliateLink = {
  id: string;
  genreId: string;
  /** 案件名（例: 転職エージェント） */
  programName: string;
  /** サービス名（例: ○○エージェント） */
  serviceName: string;
  /** 手で貼り付けたリンク。空なら記事に挿入しない */
  url: string;
  /** ボタン文言 */
  ctaText: string;
  /** どういう文脈で出すと自然か */
  placement: string;
  active: boolean;
  createdAt: string;
};

/* ─── チャネル ─────────────────────────────────────── */

export type ChannelId = "note" | "x" | "line";

export type Channel = {
  id: ChannelId;
  label: string;
  icon: string;
  /** そのチャネルの役割（集客/信頼/収益） */
  role: string;
  /** アカウント名やURL（任意） */
  handle?: string;
  /** 次にどこへ送るか */
  nextStep: string;
};

export const DEFAULT_CHANNELS: Channel[] = [
  {
    id: "x",
    label: "X",
    icon: "𝕏",
    role: "集客。短い気づきで認知を取り、noteへ送る",
    nextStep: "note記事へ誘導",
  },
  {
    id: "note",
    label: "note",
    icon: "📝",
    role: "信頼。無料で手順まで出し切り、有料パートへ繋ぐ",
    nextStep: "有料note・公式LINEへ誘導",
  },
  {
    id: "line",
    label: "公式LINE",
    icon: "💬",
    role: "教える場。副業で稼ぎたい人へ、順番に手順を届けて実行まで伴走する",
    nextStep: "ステップ配信 → 個別相談・教材・アフィリエイト",
  },
];

/* ─── 公式LINEの教育プログラム（ステップ配信） ───────────── */

/**
 * 公式LINEで順番に届ける1回分。
 * note/X は通常のコンテンツ、LINEは「教える」場という役割分担にしている。
 */
export type LessonStep = {
  id: string;
  /** 配信順（1回目、2回目…） */
  order: number;
  title: string;
  /** この回を読み終えたとき、読者ができるようになること */
  goal: string;
  /** 実際に配信する文面。未作成なら空 */
  content?: string;
  /** この回で出す課題（手を動かしてもらう） */
  assignment?: string;
  /** 紐付けるアフィリエイト案件のid（任意・URL登録済みのみ） */
  affiliateId?: string;
};

export type TeachingProgram = {
  name: string;
  /** 完走したら何ができるようになるか */
  promise: string;
  /** 想定期間 */
  duration: string;
  steps: LessonStep[];
};

/**
 * 初期カリキュラム。実績は本人しか知らないため中身は空にせず、
 * 「副業を始める人が詰まる順番」だけを骨組みとして置く。
 */
export function defaultProgram(): TeachingProgram {
  return {
    name: "副業のはじめ方 7ステップ",
    promise: "自分の経験を売れる形にして、最初の1件を受けるところまで",
    duration: "7日間（1日1通）",
    steps: [
      { id: "s1", order: 1, title: "何を売るかを決める", goal: "自分の経験から売れるものを1つ選べる" },
      { id: "s2", order: 2, title: "時間を作る", goal: "AIで作業を減らし、週に使える時間を確保できる" },
      { id: "s3", order: 3, title: "誰に売るかを決める", goal: "対象を1人に絞って言語化できる" },
      { id: "s4", order: 4, title: "実績を作る", goal: "小さくても見せられる成果物を1つ持てる" },
      { id: "s5", order: 5, title: "見つけてもらう", goal: "X/noteでの発信の型を決められる" },
      { id: "s6", order: 6, title: "値段を決める", goal: "根拠のある価格を自分で説明できる" },
      { id: "s7", order: 7, title: "最初の1件を受ける", goal: "申し込み導線を作って動かせる" },
    ],
  };
}

/* ─── ブランディング / マーケティング戦略 ─────────────── */

export type Brand = {
  /** 事業の一言説明 */
  concept: string;
  /** 誰に向けているか */
  targetReader: string;
  /** 読者の悩み */
  painPoints: string[];
  /** 提供できること（教える内容） */
  teaches: string[];
  /** 前川さんが語れる根拠（実体験・実績） */
  credibility: string[];
  /** 文体・トーン */
  tone: string;
  /** 書かないこと */
  ngList: string[];
  /** 収益導線 */
  funnel: string[];
  updatedAt: string;
};

/**
 * 初期値。実際の前川さんの実績は分からないので、
 * credibility は空にして「本人が埋める」ことを促す。
 */
export function defaultBrand(): Brand {
  return {
    concept: "副業で稼ぎたい人に、AIを使った現実的な進め方を教える",
    targetReader: "本業を持ちながら、副業で月数万円を作りたい20〜35歳",
    painPoints: [
      "何から始めればいいか分からない",
      "時間が取れない",
      "情報が多すぎて信じるものを選べない",
      "始めたが続かない",
    ],
    teaches: [
      "AIで作業を減らして副業の時間を作る方法",
      "自分の経験を売れる形にする手順",
      "稼いだお金を管理・投資に回すところまで",
    ],
    credibility: [],
    tone: "断定しすぎない。手順は具体的に。実際にやったことだけを書く。煽らない",
    ngList: [
      "再現性のない収益額を約束する表現",
      "「誰でも」「簡単に」「必ず稼げる」といった断定",
      "自分が試していない手法を勧める",
      "PR表記のないアフィリエイト誘導",
    ],
    funnel: [
      "X で気づきを投稿して認知を取る（通常のコンテンツ）",
      "note の無料記事で手順まで出し切る（通常のコンテンツ）",
      "公式LINE へ登録してもらう",
      "公式LINE のステップ配信で順番に教え、実行まで伴走する",
      "その流れの中で教材・個別相談・アフィリエイトを案内する",
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function genreOf(genres: Genre[], id: string): Genre | undefined {
  return genres.find((g) => g.id === id);
}
