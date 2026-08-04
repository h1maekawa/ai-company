/**
 * Note事業部のドメイン型。
 *
 * 位置づけ: 「まえみち」ブランド — AI・副業・読書・資産形成・習慣を通じて、
 * 人生を少し豊かにするヒントを発信するメディア事業。
 * 記事・X・公式LINEの3チャネルで集客し、有料コンテンツとアフィリエイトで収益化する。
 *
 * 収益を扱う題材なので、生成物には次の制約が常にかかる（compose.ts参照）:
 *  - 実績のない収益額を書かない（景表法の優良誤認・有利誤認を避ける）
 *  - アフィリエイトを含む記事にはPR表記を必ず入れる（ステマ規制）
 *  - 前川さん自身がやっていないことを「やった」と書かない
 *
 * 「実践記録」は独立ジャンルではなく、すべてのジャンルに共通する記事形式として扱う。
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
    id: "daily-thoughts",
    label: "日常・考え方",
    description: "日々あったこと、感じたこと、迷ったこと、小さな気づきや途中経過を記録する",
    color: "#8C8378",
  },
  {
    id: "ai",
    label: "AI",
    description: "AIを使って仕事や生活の時間をつくり、毎日を少し楽にする方法",
    color: "#657C6C",
  },
  {
    id: "side-business",
    label: "副業",
    description: "収入だけでなく、人生の選択肢を増やすための小さな実践",
    color: "#9A8065",
  },
  {
    id: "reading",
    label: "読書",
    description: "本から得た考え方を、仕事や生活で実際に試した記録",
    color: "#7B7569",
  },
  {
    id: "asset-building",
    label: "資産形成",
    description: "未来に備えるためのお金の管理、投資、学びの記録",
    color: "#50685B",
  },
  {
    id: "habits",
    label: "習慣",
    description: "毎日を整え、無理なく前へ進むための小さな習慣",
    color: "#8B9188",
  },
  {
    id: "career",
    label: "仕事・キャリア",
    description: "肩書きや働き方に縛られず、自分の選択肢を増やすための考察",
    color: "#64748B",
  },
  {
    id: "personal-development",
    label: "個人開発",
    description: "小さなサービスや仕組みを自分で作り、学んだ過程を共有する記録",
    color: "#6D7F9B",
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

export type ChannelId = "note" | "line";

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

/* ─── Xアカウント（複数運用） ───────────────────────── */

/**
 * Xは複数アカウントを運用する。どのジャンルをどのアカウントに出すかは
 * ここでの割り当てで決まる（AIには判断させない）。
 * アカウントの役割分担・handle・funnel先はまだ確定していないため、
 * 前川さんが自由に追加・編集できる形にしてある。
 */
export type XAccount = {
  id: string;
  /** 表示名（例：実践記録アカウント） */
  label: string;
  /** @なしのアカウント名。未入力なら空 */
  handle: string;
  /** このアカウントの役割・トーン */
  role: string;
  /** このアカウントに自動振り分けするジャンルのid。空なら未割り当て */
  genreIds: string[];
  /** 次にどこへ送るか（自由記述） */
  nextStep: string;
  /** このアカウント自体での収益化方法（自由記述。例：X Premium収益分配、自分の教材紹介） */
  monetization: string[];
  /**
   * 投稿本文に直接アフィリエイトリンクを含めることを許可するか。
   * falseの間はリンクへ誘導する文言だけにし、URLそのものは記事側に留める。
   * trueでも登録済みURL以外は使わせず、使ったらPR表記をその投稿にも自動で付ける。
   */
  directAffiliate: boolean;
};

/** 全ジャンルのidをまとめて割り当てるためのショートカット */
export const ALL_GENRE_IDS = DEFAULT_GENRES.map((g) => g.id);

export function defaultXAccounts(): XAccount[] {
  return [
    {
      id: "maemichi",
      label: "まえみち",
      handle: "",
      role: "人生の寄り道を日常的に記録するアカウント。AI・読書・投資・仕事・副業・習慣は人生の一部として扱う。先生として教えるのではなく、友達に話すくらいの距離感で、実際に試したこと、迷い、失敗、途中経過、日常で感じたことを自然体で共有する。投稿単体の有益さだけでなく、この人の日常や考え方をこれからも見たいと思われることを優先する。",
      genreIds: [...ALL_GENRE_IDS],
      nextStep: "まずは投稿を継続して読んでもらう。テーマを深く書いた場合のみ、自然に関連noteへ案内する。",
      monetization: ["note有料記事", "登録済みアフィリエイト", "将来の教材・サービス", "X収益分配"],
      directAffiliate: false,
    },
  ];
}

/** そのジャンルが自動振り分けされるXアカウントを探す（最初に一致したもの） */
export function accountForGenre(accounts: XAccount[], genreId: string): XAccount | undefined {
  return accounts.find((a) => a.genreIds.includes(genreId));
}

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

/** ブランドの現在バージョン。既存データの一回限りの移行判定に使う */
export const BRAND_VERSION = "maemichi-v2";

/** ブランド名・キャッチコピー・プロフィール・固定ポストなど、短く表示する情報 */
export type BrandIdentity = {
  version: string;
  name: string;
  /** 短く表示する場所（Xヘッダー、画面タイトルなど）で優先するコピー */
  primaryTagline: string;
  /** ブランド名の意味を説明する中心的な言葉。長めの説明が可能な場所で使う */
  storyTagline: string;
  /** メインコピーを置き換えない、記事・キャンペーンで使えるサブコピー */
  alternateTaglines: string[];
  xProfile: string;
  /** 文字数制限に収まらない場合の短縮版 */
  xProfileShort: string;
  noteProfile: string;
  /** Xの固定ポスト */
  fixedPost: string;
};

/** 発信者人格・文体ルール */
export type BrandPersonality = {
  traits: string[];
  basicStance: string[];
  preferredExpressions: string[];
  avoidedExpressions: string[];
  writingRules: string[];
};

/** ブランドカラー・アイコン/ヘッダーのビジュアル方針 */
export type VisualIdentity = {
  baseColor: string;
  surfaceColor: string;
  accentColor: string;
  textColor: string;
  subTextColor: string;
  secondaryColor: string;
  illustrationStyle: string[];
  iconGuidelines: string[];
  headerGuidelines: string[];
};

export type ContentPillarId =
  | "daily-thoughts" | "ai" | "reading" | "career"
  | "asset-building" | "side-business" | "habits";
export type ContentPillar = {
  id: ContentPillarId;
  label: string;
  targetRatio: number;
  description: string;
};
export type ChannelBrandGuideline = {
  purpose: string[];
  tone: string[];
  rules: string[];
};
export type BrandChannelGuidelines = {
  x: ChannelBrandGuideline;
  note: ChannelBrandGuideline;
};

export type Brand = {
  identity: BrandIdentity;
  personality: BrandPersonality;
  visualIdentity: VisualIdentity;

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
  brandGoal: string;
  contentPillars: ContentPillar[];
  channelGuidelines: BrandChannelGuidelines;
  updatedAt: string;
};

export type ContentSourceMode = "daily" | "trend";
export type DailyPostSeed = {
  whatHappened: string;
  feeling?: string;
  thought?: string;
  uncertainty?: string;
  genreId?: string;
};

export const DEFAULT_CONTENT_PILLARS: ContentPillar[] = [
  { id: "daily-thoughts", label: "日常・考え方", targetRatio: 35, description: "日常、感情、迷い、小さな気づき" },
  { id: "ai", label: "AI", targetRatio: 20, description: "人生の中でAIを試した記録" },
  { id: "reading", label: "読書", targetRatio: 15, description: "本を読んで感じ、考えたこと" },
  { id: "career", label: "仕事・キャリア", targetRatio: 10, description: "仕事や働き方で感じたこと" },
  { id: "asset-building", label: "投資・資産形成", targetRatio: 10, description: "投資やお金で迷い、学んだこと" },
  { id: "side-business", label: "副業", targetRatio: 5, description: "小さく試した副業の途中経過" },
  { id: "habits", label: "習慣", targetRatio: 5, description: "生活を整えるために試したこと" },
];

export const MAEMICHI_V1_DEFAULTS = {
  identity: {
    xProfile: "AI・副業・読書・資産形成。\n人生を、ちょっと豊かにするヒントを発信。\n実際に試したことだけを書いています。\n焦らず、一歩ずつ。",
    xProfileShort: "AI・副業・読書・資産形成。\n人生を少し豊かにする、実践ベースのヒントを発信。\n焦らず、一歩ずつ。",
    fixedPost: "はじめまして、まえみちです。\n\nこのアカウントでは、\n\n・AIで時間をつくる\n・副業で選択肢を増やす\n・読書で考え方を育てる\n・資産形成で未来に備える\n・習慣を整えて、毎日を少し良くする\n\nそんな「人生を少し豊かにするヒント」を、\n実際に試したことを中心に発信しています。\n\n大きく変わる方法は知らないけれど、\n昨日より少し前へ進む方法なら、\n一緒に考えられると思っています。\n\n人生の寄り道が、未来の近道になる。\n\nよかったら、これからよろしくお願いします。",
  },
  concept: "AI・副業・読書・資産形成・習慣を通じて、人生を少し豊かにするヒントを発信する",
} as const;

export function useV2WhenUnchanged<T>(current: T, v1Default: T, v2Default: T): T {
  return JSON.stringify(current) === JSON.stringify(v1Default) ? v2Default : current;
}

export function migrateBrandV1ToV2(old: Brand): Brand {
  const fresh = defaultBrand();
  return {
    ...fresh,
    ...old,
    identity: {
      ...fresh.identity,
      ...old.identity,
      version: BRAND_VERSION,
      xProfile: useV2WhenUnchanged(old.identity.xProfile, MAEMICHI_V1_DEFAULTS.identity.xProfile, fresh.identity.xProfile),
      xProfileShort: useV2WhenUnchanged(old.identity.xProfileShort, MAEMICHI_V1_DEFAULTS.identity.xProfileShort, fresh.identity.xProfileShort),
      fixedPost: useV2WhenUnchanged(old.identity.fixedPost, MAEMICHI_V1_DEFAULTS.identity.fixedPost, fresh.identity.fixedPost),
    },
    personality: { ...fresh.personality, ...old.personality },
    visualIdentity: { ...fresh.visualIdentity, ...old.visualIdentity },
    concept: useV2WhenUnchanged(old.concept, MAEMICHI_V1_DEFAULTS.concept, fresh.concept),
    credibility: old.credibility,
    brandGoal: old.brandGoal || fresh.brandGoal,
    contentPillars: old.contentPillars?.length ? old.contentPillars : fresh.contentPillars,
    channelGuidelines: {
      x: { ...fresh.channelGuidelines.x, ...old.channelGuidelines?.x },
      note: { ...fresh.channelGuidelines.note, ...old.channelGuidelines?.note },
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 移行判定専用：旧ブランド（副業教育メディア期）のデフォルト値そのまま。
 * ここと一致する項目だけを「まえみち」の新デフォルトへ置き換える
 * （前川さんが実際に編集した内容は上書きしない）。store.tsの移行処理からのみ使う。
 */
export const LEGACY_DEFAULT_BRAND_TEXT = {
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
};

/**
 * 「まえみち」の初期値。
 * credibilityは数字を含まない実践事実のみ既定で入れる
 * （具体的な売上・成果数値は本人が登録した場合のみ使う）。
 */
export function defaultBrand(): Brand {
  return {
    identity: {
      version: BRAND_VERSION,
      name: "まえみち",
      primaryTagline: "人生を、ちょっと豊かに。",
      storyTagline: "人生の寄り道が、未来の近道になる。",
      alternateTaglines: ["人生は、寄り道くらいがちょうどいい。"],
      xProfile:
        "人生の寄り道を、ゆるく記録中。\nAIを試したこと、本を読んで考えたこと、\n投資や仕事で迷ったこと、何気ない日常のこと。\n成功も失敗も、途中経過もそのまま残します。\n気軽にフォローしてもらえたら嬉しいです。\n人生を、ちょっと豊かに。",
      xProfileShort:
        "人生の寄り道を、ゆるく記録中。\nAI・読書・投資・仕事・日常で感じたことを、\n成功も失敗もそのまま発信。\n気軽にフォローしてもらえたら嬉しいです。",
      noteProfile:
        "人生に正解はないけれど、\n良い寄り道はあると思う。\n\nAI・読書・副業・習慣・資産形成から、\n実際に試して学んだことを発信しています。\n\n人生を、ちょっと豊かに。\n焦らず、一歩ずつ。",
      fixedPost:
        "はじめまして、まえみちです。\n\nこのアカウントは、\n「人生の寄り道」を記録する場所です。\n\nAIを触ってみて、\n「これ普通に便利じゃん。」と思ったこと。\n\n本を読んで、\n「この一文、刺さるな。」と思ったこと。\n\n投資で迷ったこと。\n仕事で感じたこと。\nたまには失敗したことも。\n\n全部ひっくるめて残していきます。\n\n誰かに教えるというより、\n自分で試して「これは良かった」「これは違った」を記録していく感覚です。\n\nその記録が、同じように頑張っている誰かのヒントになったら嬉しいです。\n\n人生に正解はないけれど、良い寄り道はあると思っています。\n\n人生を、ちょっと豊かに。\n\nこれからよろしくお願いします。",
    },
    personality: {
      traits: [
        "穏やか",
        "親しみやすい",
        "押し付けない",
        "本質を考える",
        "一緒に成長する",
        "誠実",
        "少し内省的",
        "静かに前向き",
      ],
      basicStance: [
        "自分を成功者として見せない。",
        "読者より上の立場から教えない。",
        "先生ではなく、少し先を歩きながら一緒に考える人として書く。",
        "人生を主役にし、AIや投資は人生の一部として扱う。",
        "知識よりも、体験・感情・迷い・途中経過を共有する。",
        "まだ分からないことは、分からないと書く。",
      ],
      preferredExpressions: [
        "私はこう考えています。",
        "実際に試してみました。",
        "これを試して良かったです。",
        "うまくいかなかった部分もありました。",
        "今のところ、この方法が合っています。",
        "少しずつ改善しています。",
        "もし参考になれば。",
        "焦らず、一歩ずつで大丈夫だと思います。",
        "普通に便利だった。",
        "これは意外だった。",
        "今日これ試してみた。",
        "まだ勉強中です。",
        "今のところ、こう考えています。",
        "正直、まだ迷っています。",
      ],
      avoidedExpressions: [
        "絶対にやるべきです。",
        "今すぐ始めましょう！",
        "これをやらないと損です。",
        "誰でも簡単にできます。",
        "必ず稼げます。",
        "人生が変わります。",
        "知らないと危険です。",
        "これ一択です。",
        "神ツール",
        "全員使え",
        "これだけで稼げる",
      ],
      writingRules: [
        "「〜しよう！」という強い命令形を多用しない",
        "感嘆符を多用しない",
        "読者を煽らない",
        "成功を断定しない",
        "上から教えない",
        "過度に専門家らしく見せない",
        "実際に試していない内容を体験談として書かない",
        "失敗や迷いも必要に応じて書く",
        "一文を長くしすぎない",
        "改行と余白を使う",
        "抽象論だけで終わらせない",
        "読者が今日試せる小さな行動を1つ含める",
        "毎回同じ決まり文句を機械的に付けない",
        "ブランドコピーは自然な記事でのみ使用する",
        "人生と人柄を主役にし、AIや投資だけを主役にしない",
        "カジュアル表現は本人の感情に合う場合だけ使う",
        "毎回オチや質問を付けない",
        "フォローを毎投稿で直接お願いしない",
      ],
    },
    visualIdentity: {
      baseColor: "#F7F5EF",
      surfaceColor: "#E8DFD0",
      accentColor: "#657C6C",
      textColor: "#303735",
      subTextColor: "#737872",
      secondaryColor: "#3E4B55",
      illustrationStyle: [
        "顔写真は使用しない",
        "日本のイラストレーター風",
        "優しい",
        "シンプル",
        "白・ベージュ・薄い緑を中心とする",
      ],
      iconGuidelines: [
        "20代後半くらいの人物",
        "パーカー",
        "コーヒー",
        "MacまたはノートPC",
        "本",
        "植物",
        "自然な笑顔",
      ],
      headerGuidelines: [
        "左側に人物・本・コーヒー・植物などのイラストを配置する",
        "右側にブランドコピー「人生を、ちょっと豊かに。」を配置する",
        "ジャンル表記（AI / 読書 / 副業 / 資産形成 / 習慣）を添える",
      ],
    },
    concept: "人生の中で感じたことや、実際に試したことを記録しながら、AI・読書・副業・投資・仕事・習慣・日常を通して、人生を少し豊かにする寄り道を共有するブランド。AIやノウハウではなく、人生と人柄を主役にする。",
    targetReader:
      "本業や日々の生活を続けながら、AI・副業・読書・資産形成・習慣を通じて、人生を少しずつ良くしていきたい20〜30代。強い煽りや成功者による断定的な発信には疲れており、現実的で誠実な実践記録を求めている人。",
    painPoints: [
      "何か始めたいが、何から始めればいいか分からない",
      "仕事が忙しく、自分の時間を作れない",
      "副業に興味があるが、怪しい情報が多く不安",
      "AIを使いたいが、自分の生活にどう取り入れるか分からない",
      "読書をしても、読んだだけで終わってしまう",
      "投資や資産形成を始めたいが、失敗が怖い",
      "良い習慣を作りたいが、長く続かない",
      "周囲と比べて焦ってしまう",
    ],
    teaches: [
      "AIを使って仕事や生活の時間を作る方法",
      "AIを実際の業務や副業へ取り入れた記録",
      "無理のない副業の始め方",
      "副業を通じて選択肢を増やす考え方",
      "本から学んだ内容を生活で試す方法",
      "資産形成や投資を学ぶ過程",
      "お金を管理し、未来に備える方法",
      "習慣を無理なく継続する方法",
      "失敗や遠回りから得た学び",
    ],
    credibility: [
      "AIを使った業務改善や仕組みづくりを実際に進めている",
      "AI会社という形で複数のAI活用を試している",
      "X・noteを使った発信と収益化を実践しながら検証している",
      "副業・読書・資産形成・習慣改善を自分でも試している",
      "実際に試した内容を記録し、改善を続けている",
    ],
    tone: "穏やかで親しみやすい。押し付けない。先生ではなく、少し先を歩きながら一緒に考える人として書く。",
    ngList: [
      "絶対にやるべきです。",
      "今すぐ始めましょう！",
      "これをやらないと損です。",
      "誰でも簡単にできます。",
      "必ず稼げます。",
      "人生が変わります。",
      "知らないと危険です。",
      "これ一択です。",
    ],
    funnel: [
      "Xで小さな気づきや実践内容を発信する",
      "興味を持った読者を無料noteへ案内する",
      "無料noteで体験・考え方・具体的な方法を伝える",
      "さらに深く知りたい読者へ有料noteを案内する",
      "継続的に学びたい読者を公式LINEへ案内する",
      "内容に合う場合のみ、教材・サービス・アフィリエイトを案内する",
    ],
    brandGoal: "AI・投資・読書を発信する人ではなく、この人の考え方や日常を追いかけたくなる人になる。",
    contentPillars: DEFAULT_CONTENT_PILLARS.map((pillar) => ({ ...pillar })),
    channelGuidelines: {
      x: {
        purpose: ["毎日の記録", "独り言", "リアルタイムの気づき", "会話", "迷い・途中経過"],
        tone: ["友達とカフェで話す程度の距離感", "自然体", "日記感を残す"],
        rules: ["完成されたノウハウより今感じたことを優先", "毎回質問やオチを付けない", "毎回外部導線を置かない"],
      },
      note: {
        purpose: ["振り返り", "考察", "ストーリー", "体験談", "失敗や迷いの整理"],
        tone: ["背景と感情を丁寧に書く", "結論を急がない", "自然体"],
        rules: ["Xを単純に長文化しない", "考えが変わった過程を書く", "分からないことを無理に結論づけない"],
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function genreOf(genres: Genre[], id: string): Genre | undefined {
  return genres.find((g) => g.id === id);
}
