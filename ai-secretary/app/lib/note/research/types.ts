/**
 * まえみち コンテンツリサーチ / 収益化 / 投稿基盤のドメイン型。
 *
 * 原則:
 *  - 他者の文章をそのまま保存・再利用しない。パターン（型）へ抽象化して持つ
 *  - 公開されていない数値（閲覧数・売上）を推測して事実として保存しない
 *  - 取得できなかった数値は 0 ではなく undefined
 *  - まえみち自身はリサーチ対象にしない（評価・変換のためのブランド人格として使う）
 */

/* ─── 参考アカウント ───────────────────────────────── */

export type Priority = 1 | 2 | 3;

export type ReferenceXAccount = {
  id: string;
  /** @なし */
  handle: string;
  displayName?: string;
  profileUrl: string;
  genres: string[];
  /** なぜ参考にするのか（人が書く） */
  reason: string;
  active: boolean;
  priority: Priority;
  lastResearchedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceNoteCreator = {
  id: string;
  name: string;
  creatorUrl: string;
  genres: string[];
  reason: string;
  active: boolean;
  priority: Priority;
  lastResearchedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/* ─── Xリサーチ設定 ───────────────────────────────── */

/**
 * free: 公開検索・手動貼り付けのみ。X APIを使わない（精度は限定的）
 * official-api: X APIで参考アカウント/キーワードを取得。予算上限で自動停止
 */
export type XResearchMode = "free" | "official-api";

export type XResearchSettings = {
  mode: XResearchMode;
  enabled: boolean;
  maxReferenceAccountsPerRun: number;
  maxPostsPerAccount: number;
  monthlyBudgetUsd: number;
  currentEstimatedSpendUsd: number;
  /** 予算集計をリセットした月（YYYY-MM）。月が変われば spend を 0 に戻す */
  spendPeriod?: string;
  lookbackHours: number;
  keywords: string[];
  lastRunAt?: string;
};

export function defaultXResearchSettings(): XResearchSettings {
  return {
    mode: "free",
    enabled: false,
    maxReferenceAccountsPerRun: 10,
    maxPostsPerAccount: 3,
    monthlyBudgetUsd: 0,
    currentEstimatedSpendUsd: 0,
    spendPeriod: new Date().toISOString().slice(0, 7),
    lookbackHours: 72,
    keywords: [],
  };
}

/* ─── リサーチ結果 ───────────────────────────────── */

export type ResearchPlatform = "x" | "note" | "web";

export type GrowthGoal =
  | "reach"
  | "conversation"
  | "save"
  | "profile-follow"
  | "note-bridge"
  | "trust"
  | "monetization";

export type OutputType =
  | "x-post"
  | "x-thread"
  | "note-free"
  | "note-paid-outline"
  | "x-and-note";

export type XPostLength = "short" | "standard" | "long";
export type XPostPattern = "daily" | "reflection" | "tried" | "opinion" | "save" | "conversation" | "note-link";
export type MediaSuggestion =
  | "text"
  | "diagram"
  | "screenshot"
  | "comparison"
  | "chart"
  | "video"
  | "note-thumbnail";

export type ResearchRequest = {
  focusTopic?: string;
  platform?: "x" | "note" | "both";
  xQuery?: string;
  genreId?: string;
  growthGoal?: GrowthGoal;
  personalAngle?: string;
};

export type ResearchSourceType =
  | "reference-account"
  | "keyword"
  | "trend"
  | "featured"
  | "manual";

export type PublicMetrics = {
  likes?: number;
  replies?: number;
  reposts?: number;
  impressions?: number;
  followers?: number;
};

/**
 * 1件の調査結果。
 * textExcerpt は「なぜ反応されたか」を判断するための最小限の抜粋に留め、
 * 生成プロンプトには本文ではなく下の *Pattern 群を渡す。
 */
export type ResearchItem = {
  id: string;
  platform: ResearchPlatform;
  sourceType: ResearchSourceType;
  sourceAccountId?: string;
  sourceUrl: string;

  title?: string;
  /** 引用範囲。全文は保存しない */
  textExcerpt: string;
  authorName?: string;
  publishedAt?: string;

  publicMetrics?: PublicMetrics;

  detectedGenreIds: string[];

  /* 抽象化した「型」。生成時はここだけを使う */
  hookPattern?: string;
  structurePattern?: string;
  emotionalAngle?: string;
  readerProblem?: string;
  ctaPattern?: string;

  fetchedAt: string;
};

/* ─── トレンドクラスタ ───────────────────────────── */

export type TrendClusterStatus =
  | "candidate"
  | "selected"
  | "rejected"
  | "used"
  | "expired";

export type TrendCluster = {
  id: string;
  title: string;
  summary: string;
  genreIds: string[];

  researchItemIds: string[];
  sourceCount: number;

  firstDetectedAt: string;
  lastDetectedAt: string;

  /** 話題性 25 */
  trendScore: number;
  /** まえみち適合 25 */
  brandFitScore: number;
  /** 本人体験との一致 20 */
  experienceFitScore: number;
  /** 収益導線との一致 15 */
  monetizationFitScore: number;
  /** オリジナル化しやすさ 15 */
  originalityScore: number;
  totalScore: number;

  /** 減点の理由（人が読んで納得できるように残す） */
  penalties: string[];
  /** 高リスク題材などで自動公開対象外にする */
  blocked: boolean;
  blockReason?: string;

  /** 使えそうな本人の体験（experience-library の id） */
  matchedExperienceIds: string[];

  status: TrendClusterStatus;
};

/* ─── 体験ライブラリ ───────────────────────────── */

export type ExperienceSourceType =
  | "manual"
  | "morning-task"
  | "project-log"
  | "conversation"
  | "reading"
  | "investment"
  | "work";

export type ExperienceEntry = {
  id: string;
  title: string;
  occurredAt?: string;
  genres: string[];
  summary: string;

  whatHappened: string;
  whatWasTried: string;
  whatWorked?: string;
  whatDidNotWork?: string;
  lesson?: string;

  /** 記事に再利用してよい事実（数字を含む場合は本人確認済みのみ） */
  reusableFacts: string[];

  sourceType: ExperienceSourceType;
  sourcePath?: string;

  /** false の間は断定的な体験談として公開しない */
  verifiedByUser: boolean;
  sensitive: boolean;

  createdAt: string;
  updatedAt: string;
};

export type ViewpointLibraryEntry = {
  id: string;
  title: string;
  topic: string;
  opinion: string;
  reasons: string[];
  uncertainties: string[];
  sourceBriefId?: string;
  sourceDraftIds: string[];
  reusable: boolean;
  verifiedByUser: boolean;
  createdAt: string;
  updatedAt: string;
};

/* ─── コンテンツ設計 ───────────────────────────── */

export type ContentPurpose =
  | "reach"
  | "trust"
  | "note-bridge"
  | "affiliate"
  | "paid-note"
  | "x-monetization";

export type ContentDestination = "none" | "free-note" | "paid-note" | "affiliate-direct";

export type ContentBrief = {
  id: string;
  trendClusterId: string;
  purpose: ContentPurpose;
  genreId: string;

  readerProblem: string;
  keyMessage: string;

  selectedExperienceIds: string[];
  researchItemIds: string[];

  destination: ContentDestination;
  affiliateId?: string;
  noteArticleId?: string;

  createdAt: string;
};

/** 投稿目的の比率。設定画面から変更できる */
export type PurposeMix = {
  reach: number;
  noteBridge: number;
  monetize: number;
};

export function defaultPurposeMix(): PurposeMix {
  return { reach: 70, noteBridge: 20, monetize: 10 };
}

/* ─── X投稿ドラフト ───────────────────────────── */

export type SocialDraftStatus =
  | "draft"
  | "approved"
  | "queued"
  | "scheduled"
  | "published"
  | "failed"
  | "discarded";

export type SocialDraft = {
  id: string;
  briefId?: string;
  trendClusterId?: string;
  /** Research / 本人視点 / 本人体験からこのAI下書きまでのLineage */
  sourceResearchIds?: string[];
  sourceViewpointIds?: string[];
  sourceExperienceIds?: string[];

  xAccountId: string;
  purpose: ContentPurpose;
  genreId: string;

  text: string;
  pattern?: XPostPattern;
  length?: XPostLength;
  hookCandidates?: string[];
  mediaSuggestion?: MediaSuggestion;
  threadId?: string;
  threadIndex?: number;
  threadTotal?: number;
  /** 本文に残った登録済みURL（未登録は生成後に除去済み） */
  urls: string[];
  affiliateId?: string;
  needsDisclosure: boolean;

  /** 類似度チェックの結果。閾値超過なら approved にできない */
  similarityScore?: number;
  similarTo?: string;

  status: SocialDraftStatus;
  scheduledAt?: string;
  bufferPostId?: string;
  failureReason?: string;

  createdAt: string;
  updatedAt: string;
};

/* ─── note記事ドラフト ───────────────────────────── */

export type NoteArticleType = "free" | "paid" | "affiliate";

export type NoteArticleStatus =
  | "draft"
  | "approved"
  | "queued"
  | "published"
  | "failed";

export type NoteArticleDraft = {
  id: string;
  title: string;
  subtitle?: string;
  articleType: NoteArticleType;

  freeSection: string;
  paidSection?: string;
  paywallAfterHeading?: string;
  price?: number;

  tags: string[];

  affiliateIds: string[];
  needsDisclosure: boolean;

  headerImagePath?: string;

  sourceResearchItemIds: string[];
  sourceViewpointIds?: string[];
  sourceExperienceIds: string[];

  status: NoteArticleStatus;
  noteUrl?: string;

  createdAt: string;
  updatedAt: string;
};

/* ─── アフィリエイトの運用ポリシー ─────────────────── */

export type AffiliateChannel = "x" | "note-free" | "note-paid" | "line";

export type AffiliatePolicy = {
  affiliateId: string;
  allowedChannels: AffiliateChannel[];
  disclosureTextX: string;
  disclosureTextNote: string;
  /** 書いてはいけない訴求（例：「必ず稼げる」） */
  claimRestrictions: string[];
  expiresAt?: string;
  directXAllowed: boolean;
  paidNoteAllowed: boolean;
};

export function defaultAffiliatePolicy(affiliateId: string): AffiliatePolicy {
  return {
    affiliateId,
    allowedChannels: ["note-free"],
    disclosureTextX: "[PR]",
    disclosureTextNote: "※本記事にはプロモーションが含まれます",
    claimRestrictions: [],
    directXAllowed: false,
    paidNoteAllowed: false,
  };
}

/* ─── 投稿実績 ───────────────────────────────── */

/** 取得できない数値は 0 ではなく undefined のままにする */
export type ContentPerformance = {
  contentId: string;
  platform: "x" | "note";
  purpose: ContentPurpose;
  genreId: string;
  publishedAt: string;

  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  profileClicks?: number;
  followsFromPost?: number;
  urlClicks?: number;
  videoViews?: number;
  mediaViews?: number;
  followerCountAtPost?: number;
  currentFollowerCount?: number;
  pattern?: XPostPattern;
  length?: XPostLength;
  mediaSuggestion?: MediaSuggestion;
  hasQuestion?: boolean;
  hasExternalLink?: boolean;
  linkClicks?: number;

  noteViews?: number;
  noteLikes?: number;
  noteSales?: number;
  noteRevenue?: number;

  affiliateClicks?: number;
  affiliateConversions?: number;
  affiliateRevenue?: number;

  measuredAt: string;
  measurementWindow?: "30m" | "1h" | "3h" | "24h" | "72h" | "7d";
};

export type RevenueSharingProgress = {
  premiumActive?: boolean;
  organicImpressions90Days?: number;
  requiredOrganicImpressions: number;
  verifiedFollowers?: number;
  requiredVerifiedFollowers: number;
  stripeConnected?: boolean;
  identityVerified?: boolean;
  accountInGoodStanding?: boolean;
  eligibleCountry?: boolean;
  lastCheckedAt: string;
};

export type MonetizationRule = {
  program: "revenue-sharing" | "subscriptions";
  requirements: Record<string, number | boolean | string>;
  sourceLabel: string;
  verifiedAt: string;
  active: boolean;
};

/* ─── 投稿ジョブ（Playwrightローカルランナー用） ─────── */

export type PublishJobStatus = "pending" | "running" | "done" | "failed";

export type PublishJob = {
  id: string;
  kind: "note-draft" | "note-publish";
  articleId: string;
  status: PublishJobStatus;
  /** Slackで最終承認された時刻。未承認のジョブはランナーへ渡さない */
  approvedAt?: string;
  approvedBy?: string;
  startedAt?: string;
  finishedAt?: string;
  resultUrl?: string;
  failureReason?: string;
  screenshotPaths?: string[];
  createdAt: string;
};

/* ─── フィーチャーフラグ / 停止スイッチ ─────────────── */

export type FeatureFlags = {
  xFreeWorkspaceEnabled: boolean;
  xOfficialEmbedEnabled: boolean;
  xWebIntentsEnabled: boolean;
  xManualPostImportEnabled: boolean;
  xArchiveImportEnabled: boolean;
  xPaidApiEnabled: boolean;
  /** 常にfalse。ブラウザ自動操作は禁止 */
  xBrowserAutomationEnabled: false;
  /** 本人原稿をMac上のローカルAIで添削する。初期OFF */
  localAiEditorEnabled: boolean;
  /** 全体の停止スイッチ。false ならどのチャネルにも投稿しない */
  publishingEnabled: boolean;
  /** X自動投稿（Buffer予約）。初期OFF */
  xAutoPublish: boolean;
  /** note自動公開。初期OFF */
  noteAutoPublish: boolean;
  /** note下書き保存までに限定する */
  noteDraftOnly: boolean;
  /** 有料note公開は必ず人間確認 */
  paidNoteRequireConfirm: boolean;
  /** 1日あたりのX投稿上限 */
  maxXPostsPerDay: number;
  /** Bufferの予約枠のうち自動で埋めてよい件数 */
  maxBufferScheduled: number;
  /** 同じアフィリエイトを連投しない最小間隔（投稿数） */
  affiliateCooldownPosts: number;
};

export function defaultFeatureFlags(): FeatureFlags {
  return {
    xFreeWorkspaceEnabled: false,
    xOfficialEmbedEnabled: true,
    xWebIntentsEnabled: true,
    xManualPostImportEnabled: true,
    xArchiveImportEnabled: false,
    xPaidApiEnabled: false,
    xBrowserAutomationEnabled: false,
    localAiEditorEnabled: false,
    publishingEnabled: false,
    xAutoPublish: false,
    noteAutoPublish: false,
    noteDraftOnly: true,
    paidNoteRequireConfirm: true,
    maxXPostsPerDay: 3,
    maxBufferScheduled: 7,
    affiliateCooldownPosts: 5,
  };
}

/* ─── 高リスク題材の判定 ───────────────────────── */

/** 自動公開対象外にする題材。ここに当たったら blocked にする */
export const HIGH_RISK_PATTERNS: { label: string; words: string[] }[] = [
  { label: "政治", words: ["選挙", "政党", "政権", "議員", "改憲"] },
  { label: "医療", words: ["診断", "治療", "処方", "副作用", "がん", "うつ病"] },
  { label: "法律", words: ["違法", "訴訟", "判例", "法的措置", "弁護士に相談"] },
  {
    label: "投資助言",
    words: ["必ず儲かる", "元本保証", "推奨銘柄", "buy推奨", "今が買い時"],
  },
  // 実リサーチで競艇予想の記事が候補に上がったため追加。
  // 「稼げる」と結びつくギャンブル題材はまえみちのブランドから外れる
  {
    label: "ギャンブル",
    words: ["競艇", "競馬", "パチンコ", "スロット", "オンラインカジノ", "コロガシ", "馬券", "舟券"],
  },
];

export function detectHighRisk(text: string): string | null {
  for (const group of HIGH_RISK_PATTERNS) {
    if (group.words.some((w) => text.includes(w))) return group.label;
  }
  return null;
}
