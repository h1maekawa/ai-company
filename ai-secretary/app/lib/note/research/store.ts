/**
 * リサーチ / 投稿基盤のVaultストア。
 * 既存のNote事業部と同じ「人間可読Markdown＋末尾jsonブロック」形式。
 *
 * どのファイルも「無ければ安全な既定値を返す」ので、
 * 初回起動でも既存データが無い環境でも壊れない。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import {
  AffiliatePolicy,
  ContentBrief,
  ContentPerformance,
  MonetizationRule,
  RevenueSharingProgress,
  ExperienceEntry,
  FeatureFlags,
  NoteArticleDraft,
  PublishJob,
  PurposeMix,
  ReferenceNoteCreator,
  ReferenceXAccount,
  ResearchItem,
  SocialDraft,
  TrendCluster,
  XResearchSettings,
  ViewpointLibraryEntry,
  defaultFeatureFlags,
  defaultPurposeMix,
  defaultXResearchSettings,
} from "./types";

const ROOT = "memory/personal/note";

export const RESEARCH_PATHS = {
  references: `${ROOT}/reference-accounts.md`,
  settings: `${ROOT}/research-settings.md`,
  inbox: `${ROOT}/research-inbox.md`,
  clusters: `${ROOT}/trend-clusters.md`,
  experiences: `${ROOT}/experience-library.md`,
  briefs: `${ROOT}/content-briefs.md`,
  socialDrafts: `${ROOT}/social-drafts.md`,
  publishingHistory: `${ROOT}/publishing-history.md`,
  performance: `${ROOT}/content-performance.md`,
  noteQueue: `${ROOT}/note-publish-queue.md`,
  viewpoints: `${ROOT}/viewpoint-library.md`,
} as const;

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await getVaultFile(path);
    return extractJson<T>(file.content || "");
  } catch {
    return null;
  }
}

async function write(path: string, markdown: string): Promise<void> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(path, markdown, sha);
}

/** 人間可読の見出し＋jsonブロックを組み立てる共通ヘルパ */
function buildDoc(title: string, note: string, humanBody: string, data: unknown): string {
  return `---
type: ${title}
updated: ${new Date().toISOString()}
---

# ${title}

${note}

${humanBody}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

const bullets = (items: string[]) =>
  items.length > 0 ? items.join("\n") : "（まだありません）";

/* ─── 参考アカウント ───────────────────────────── */

export type ReferenceFile = {
  xAccounts: ReferenceXAccount[];
  noteCreators: ReferenceNoteCreator[];
};

export async function loadReferences(): Promise<ReferenceFile> {
  const data = await readJson<ReferenceFile>(RESEARCH_PATHS.references);
  return {
    xAccounts: Array.isArray(data?.xAccounts) ? data.xAccounts : [],
    noteCreators: Array.isArray(data?.noteCreators) ? data.noteCreators : [],
  };
}

export async function saveReferences(file: ReferenceFile): Promise<ReferenceFile> {
  const human = [
    "## Xの参考アカウント",
    "",
    bullets(
      file.xAccounts.map(
        (a) =>
          `- ${a.active ? "✅" : "⏸"} **@${a.handle}**${a.displayName ? `（${a.displayName}）` : ""} — 優先度${a.priority} / ${a.genres.join("、") || "ジャンル未設定"}\n  理由: ${a.reason || "（未記入）"}`
      )
    ),
    "",
    "## noteの参考クリエイター",
    "",
    bullets(
      file.noteCreators.map(
        (c) =>
          `- ${c.active ? "✅" : "⏸"} **${c.name}** — 優先度${c.priority} / ${c.genres.join("、") || "ジャンル未設定"}\n  ${c.creatorUrl}\n  理由: ${c.reason || "（未記入）"}`
      )
    ),
  ].join("\n");

  await write(
    RESEARCH_PATHS.references,
    buildDoc(
      "note_reference_accounts",
      "リサーチの参考にするアカウントです。まえみち自身は対象にしません。\n**他者の文章はそのまま保存せず、型（フック・構成・CTA）だけを抽出します。**",
      human,
      file
    )
  );
  return file;
}

/* ─── リサーチ設定 ───────────────────────────── */

export type ResearchSettingsFile = {
  x: XResearchSettings;
  purposeMix: PurposeMix;
  flags: FeatureFlags;
  /** noteリサーチで巡回するタグ */
  noteTags: string[];
};

const DEFAULT_NOTE_TAGS = [
  "AI",
  "副業",
  "読書",
  "資産形成",
  "習慣",
  "働き方",
  "AI活用",
  "個人開発",
  "業務改善",
];

export async function loadResearchSettings(): Promise<ResearchSettingsFile> {
  const data = await readJson<ResearchSettingsFile>(RESEARCH_PATHS.settings);
  const x = { ...defaultXResearchSettings(), ...(data?.x ?? {}) };

  // 月が変わっていたらAPI予算の集計をリセットする
  const period = new Date().toISOString().slice(0, 7);
  if (x.spendPeriod !== period) {
    x.spendPeriod = period;
    x.currentEstimatedSpendUsd = 0;
  }

  const flags = { ...defaultFeatureFlags(), ...(data?.flags ?? {}) };
  flags.xBrowserAutomationEnabled = false;
  if (process.env.X_API_ENABLED !== "true") flags.xPaidApiEnabled = false;
  return {
    x,
    purposeMix: { ...defaultPurposeMix(), ...(data?.purposeMix ?? {}) },
    flags,
    noteTags:
      Array.isArray(data?.noteTags) && data.noteTags.length > 0
        ? data.noteTags
        : DEFAULT_NOTE_TAGS,
  };
}

export async function saveResearchSettings(
  file: ResearchSettingsFile
): Promise<ResearchSettingsFile> {
  const flags = {
    ...file.flags,
    xBrowserAutomationEnabled: false as const,
    xPaidApiEnabled: process.env.X_API_ENABLED === "true" && file.flags.xPaidApiEnabled,
  };
  const safeFile = { ...file, flags };
  const { x, purposeMix } = safeFile;
  const human = [
    "## Xリサーチ",
    `- モード: **${x.mode}**${x.mode === "free" ? "（X APIを使わないため精度は限定的）" : ""}`,
    `- 有効: ${x.enabled ? "はい" : "いいえ"}`,
    `- 1回あたり参考アカウント数: ${x.maxReferenceAccountsPerRun} / アカウントあたり投稿数: ${x.maxPostsPerAccount}`,
    `- 遡る時間: ${x.lookbackHours}時間`,
    `- 月額上限: $${x.monthlyBudgetUsd} / 今月の推定利用: $${x.currentEstimatedSpendUsd}`,
    `- キーワード: ${x.keywords.join("、") || "（未設定）"}`,
    "",
    "## noteリサーチ対象タグ",
    safeFile.noteTags.map((t) => `- ${t}`).join("\n"),
    "",
    "## 投稿目的の比率",
    `- 認知（reach）: ${purposeMix.reach}%`,
    `- note誘導: ${purposeMix.noteBridge}%`,
    `- 収益（アフィリエイト・有料note）: ${purposeMix.monetize}%`,
    "",
    "## 投稿フラグ（安全装置）",
    `- 投稿全体: ${flags.publishingEnabled ? "有効" : "**停止中**"}`,
    `- X自動投稿: ${flags.xAutoPublish ? "有効" : "**OFF**"}`,
    `- note自動公開: ${flags.noteAutoPublish ? "有効" : "**OFF**"}`,
    `- note下書きのみ: ${flags.noteDraftOnly ? "はい" : "いいえ"}`,
    `- 有料note公開に人間確認: ${flags.paidNoteRequireConfirm ? "必須" : "不要"}`,
    `- 1日のX投稿上限: ${flags.maxXPostsPerDay}件 / Buffer自動予約上限: ${flags.maxBufferScheduled}件`,
  ].join("\n");

  await write(
    RESEARCH_PATHS.settings,
    buildDoc(
      "note_research_settings",
      "リサーチと投稿の設定です。フラグがOFFの間はどのチャネルにも投稿しません。",
      human,
      safeFile
    )
  );
  return safeFile;
}

/* ─── リサーチ結果（inbox） ───────────────────── */

export type ResearchInboxFile = { items: ResearchItem[] };

const MAX_INBOX_ITEMS = 400;

export async function loadResearchInbox(): Promise<ResearchItem[]> {
  const data = await readJson<ResearchInboxFile>(RESEARCH_PATHS.inbox);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function saveResearchInbox(items: ResearchItem[]): Promise<ResearchItem[]> {
  // 新しい順に上限まで残す（Vaultを無限に太らせない）
  const trimmed = [...items]
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
    .slice(0, MAX_INBOX_ITEMS);

  const human = [
    `取得件数: ${trimmed.length}`,
    "",
    ...trimmed.slice(0, 40).map((i) => {
      const metrics = i.publicMetrics
        ? Object.entries(i.publicMetrics)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => `${k}:${v}`)
            .join(" / ")
        : "";
      return `- [${i.platform}] ${i.title ?? i.textExcerpt.slice(0, 40)}${metrics ? `（${metrics}）` : ""}\n  ${i.sourceUrl}`;
    }),
  ].join("\n");

  await write(
    RESEARCH_PATHS.inbox,
    buildDoc(
      "note_research_inbox",
      "調査で見つけた公開情報です。**本文全体は保存せず、抜粋と型のみ**を持ちます。\n公開されていない閲覧数・売上は保存しません。",
      human,
      { items: trimmed }
    )
  );
  return trimmed;
}

/* ─── トレンドクラスタ ───────────────────────── */

export type ClusterFile = { clusters: TrendCluster[] };

export async function loadClusters(): Promise<TrendCluster[]> {
  const data = await readJson<ClusterFile>(RESEARCH_PATHS.clusters);
  return Array.isArray(data?.clusters) ? data.clusters : [];
}

export async function saveClusters(clusters: TrendCluster[]): Promise<TrendCluster[]> {
  const sorted = [...clusters].sort((a, b) => b.totalScore - a.totalScore);
  const human = [
    "| スコア | テーマ | ソース数 | 状態 | 体験 |",
    "| --- | --- | --- | --- | --- |",
    ...sorted
      .slice(0, 30)
      .map(
        (c) =>
          `| ${c.totalScore} | ${c.title} | ${c.sourceCount} | ${c.blocked ? `⚠️${c.blockReason}` : c.status} | ${c.matchedExperienceIds.length > 0 ? "あり" : "なし"} |`
      ),
  ].join("\n");

  await write(
    RESEARCH_PATHS.clusters,
    buildDoc(
      "note_trend_clusters",
      "似た調査結果をテーマ単位にまとめ、まえみちとの相性で採点したものです。\n採点は決定的な計算で、AIの気分では変わりません。",
      human,
      { clusters: sorted }
    )
  );
  return sorted;
}

/* ─── 体験ライブラリ ───────────────────────── */

export type ExperienceFile = { experiences: ExperienceEntry[] };

export async function loadExperiences(): Promise<ExperienceEntry[]> {
  const data = await readJson<ExperienceFile>(RESEARCH_PATHS.experiences);
  return Array.isArray(data?.experiences) ? data.experiences : [];
}

export async function saveExperiences(
  experiences: ExperienceEntry[]
): Promise<ExperienceEntry[]> {
  const verified = experiences.filter((e) => e.verifiedByUser).length;
  const human = [
    `登録: ${experiences.length}件（本人確認済み: ${verified}件）`,
    "",
    "> 本人確認済みでない体験は、断定的な体験談として記事に書きません。",
    "",
    ...experiences
      .slice(0, 40)
      .map(
        (e) =>
          `- ${e.verifiedByUser ? "✅" : "⏳"}${e.sensitive ? "🔒" : ""} **${e.title}**（${e.genres.join("、") || "ジャンル未設定"}）\n  ${e.summary}`
      ),
  ].join("\n");

  await write(
    RESEARCH_PATHS.experiences,
    buildDoc(
      "note_experience_library",
      "前川さん自身が実際にやったことの記録です。記事の説得力はここから来ます。",
      human,
      { experiences }
    )
  );
  return experiences;
}

/* ─── 本人の考え方ライブラリ ───────────────────── */

type ViewpointFile = { viewpoints: ViewpointLibraryEntry[] };

export async function loadViewpoints(): Promise<ViewpointLibraryEntry[]> {
  const data = await readJson<ViewpointFile>(RESEARCH_PATHS.viewpoints);
  return Array.isArray(data?.viewpoints) ? data.viewpoints : [];
}

export async function saveViewpoints(
  viewpoints: ViewpointLibraryEntry[]
): Promise<ViewpointLibraryEntry[]> {
  const human = viewpoints.length
    ? viewpoints.slice(0, 50).map((item) => `- ✅ **${item.title}**（${item.topic}）\n  ${item.opinion}`).join("\n")
    : "（まだありません）";
  await write(
    RESEARCH_PATHS.viewpoints,
    buildDoc(
      "maemichi_viewpoint_library",
      "前川さんが明示的に「今後も使える」と確認した考えだけを保存します。",
      human,
      { viewpoints }
    )
  );
  return viewpoints;
}

/* ─── コンテンツブリーフ ───────────────────── */

export type BriefFile = { briefs: ContentBrief[] };

export async function loadBriefs(): Promise<ContentBrief[]> {
  const data = await readJson<BriefFile>(RESEARCH_PATHS.briefs);
  return Array.isArray(data?.briefs) ? data.briefs : [];
}

export async function saveBriefs(briefs: ContentBrief[]): Promise<ContentBrief[]> {
  const human = briefs
    .slice(0, 30)
    .map((b) => `- [${b.purpose}] ${b.keyMessage}（→ ${b.destination}）`)
    .join("\n");
  await write(
    RESEARCH_PATHS.briefs,
    buildDoc("note_content_briefs", "何を・誰に・どこへ繋ぐかの設計です。", human || "（まだありません）", {
      briefs,
    })
  );
  return briefs;
}

/* ─── X投稿ドラフト ───────────────────────── */

export type SocialDraftFile = { drafts: SocialDraft[] };

export async function loadSocialDrafts(): Promise<SocialDraft[]> {
  const data = await readJson<SocialDraftFile>(RESEARCH_PATHS.socialDrafts);
  return Array.isArray(data?.drafts) ? data.drafts : [];
}

export async function saveSocialDrafts(drafts: SocialDraft[]): Promise<SocialDraft[]> {
  const human = drafts
    .slice(0, 30)
    .map(
      (d) =>
        `- [${d.status}]${d.needsDisclosure ? "[PR]" : ""} ${d.text.slice(0, 50).replace(/\n/g, " ")}…${d.scheduledAt ? `（${d.scheduledAt} 予約）` : ""}`
    )
    .join("\n");
  await write(
    RESEARCH_PATHS.socialDrafts,
    buildDoc(
      "note_social_drafts",
      "X投稿の下書きです。承認されるまで投稿されません。",
      human || "（まだありません）",
      { drafts }
    )
  );
  return drafts;
}

/* ─── note公開キュー ───────────────────────── */

export type NoteQueueFile = { articles: NoteArticleDraft[]; jobs: PublishJob[] };

export async function loadNoteQueue(): Promise<NoteQueueFile> {
  const data = await readJson<NoteQueueFile>(RESEARCH_PATHS.noteQueue);
  return {
    articles: Array.isArray(data?.articles) ? data.articles : [],
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
  };
}

export async function saveNoteQueue(file: NoteQueueFile): Promise<NoteQueueFile> {
  const human = [
    "## 記事",
    file.articles
      .slice(0, 30)
      .map(
        (a) =>
          `- [${a.status}][${a.articleType}] ${a.title}${a.price ? `（¥${a.price}）` : ""}${a.noteUrl ? `\n  ${a.noteUrl}` : ""}`
      )
      .join("\n") || "（まだありません）",
    "",
    "## 投稿ジョブ",
    file.jobs
      .slice(0, 30)
      .map((j) => `- [${j.status}] ${j.kind} / ${j.articleId}${j.approvedAt ? "（承認済み）" : "（未承認）"}`)
      .join("\n") || "（まだありません）",
  ].join("\n");

  await write(
    RESEARCH_PATHS.noteQueue,
    buildDoc(
      "note_publish_queue",
      "note公開用の下書きとジョブです。Slackで承認されたジョブだけローカルランナーへ渡します。",
      human,
      file
    )
  );
  return file;
}

/* ─── 投稿履歴 ───────────────────────────── */

export type HistoryEntry = {
  id: string;
  platform: "x" | "note";
  contentId: string;
  /** 公開物の元となったAI下書き。公開履歴自身は本人の正式な公開物を表す。 */
  draftId?: string;
  sourceResearchIds?: string[];
  sourceViewpointIds?: string[];
  sourceExperienceIds?: string[];
  action: string;
  at: string;
  detail?: string;
  url?: string;
};

export type HistoryFile = { entries: HistoryEntry[] };

const MAX_HISTORY = 300;

export async function loadHistory(): Promise<HistoryEntry[]> {
  const data = await readJson<HistoryFile>(RESEARCH_PATHS.publishingHistory);
  return Array.isArray(data?.entries) ? data.entries : [];
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const entries = [entry, ...(await loadHistory())].slice(0, MAX_HISTORY);
  const human = entries
    .slice(0, 40)
    .map((e) => `- ${e.at} [${e.platform}] ${e.action}${e.detail ? ` — ${e.detail}` : ""}`)
    .join("\n");
  await write(
    RESEARCH_PATHS.publishingHistory,
    buildDoc("note_publishing_history", "実際に投稿・予約した記録です。下書きとは区別し、元Research・本人Viewpoint・公開結果をIDで追跡します。", human || "（まだありません）", {
      entries,
    })
  );
}

/* ─── 投稿実績 ───────────────────────────── */

export type PerformanceFile = {
  records: ContentPerformance[];
  policies: AffiliatePolicy[];
  revenueProgress: RevenueSharingProgress;
  monetizationRules: MonetizationRule[];
};

const defaultRevenueProgress = (): RevenueSharingProgress => ({
  requiredOrganicImpressions: 5_000_000,
  requiredVerifiedFollowers: 500,
  lastCheckedAt: new Date().toISOString(),
});
const defaultMonetizationRules = (): MonetizationRule[] => [
  {
    program: "revenue-sharing",
    requirements: { note: "公式条件は変更されるため手動確認" },
    sourceLabel: "X公式の最新条件を確認",
    verifiedAt: new Date().toISOString(),
    active: true,
  },
  {
    program: "subscriptions",
    requirements: { note: "収益配分とは別条件。公式条件を手動確認" },
    sourceLabel: "X公式の最新条件を確認",
    verifiedAt: new Date().toISOString(),
    active: true,
  },
];

export async function loadPerformance(): Promise<PerformanceFile> {
  const data = await readJson<PerformanceFile>(RESEARCH_PATHS.performance);
  return {
    records: Array.isArray(data?.records) ? data.records : [],
    policies: Array.isArray(data?.policies) ? data.policies : [],
    revenueProgress: data?.revenueProgress ?? defaultRevenueProgress(),
    monetizationRules: Array.isArray(data?.monetizationRules) && data.monetizationRules.length > 0
      ? data.monetizationRules
      : defaultMonetizationRules(),
  };
}

export async function savePerformance(file: PerformanceFile): Promise<PerformanceFile> {
  const num = (v?: number) => (typeof v === "number" ? String(v) : "—");
  const human = [
    "| 日付 | 媒体 | 目的 | Imp | いいね | クリック | 売上 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...file.records
      .slice(0, 30)
      .map(
        (r) =>
          `| ${r.publishedAt.slice(0, 10)} | ${r.platform} | ${r.purpose} | ${num(r.impressions)} | ${num(r.likes ?? r.noteLikes)} | ${num(r.linkClicks ?? r.affiliateClicks)} | ${num(r.noteRevenue ?? r.affiliateRevenue)} |`
      ),
    "",
    "> 「—」は取得できていない項目です（0件という意味ではありません）。",
  ].join("\n");

  await write(
    RESEARCH_PATHS.performance,
    buildDoc(
      "note_content_performance",
      "投稿の反応です。取得できない数値は0ではなく未取得として扱います。",
      human,
      file
    )
  );
  return file;
}
