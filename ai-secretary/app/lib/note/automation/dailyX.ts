import { accountForGenre, DEFAULT_GENRES } from "@/app/lib/note/types";
import { loadBrand, loadIdeas } from "@/app/lib/note/store";
import { usableExperiences } from "@/app/lib/note/research/experience";
import { generateXPosts } from "@/app/lib/note/research/generate";
import {
  appendHistory,
  loadClusters,
  loadExperiences,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
  saveClusters,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";
import { createPost, isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import {
  canPublishToday,
  claimOnce,
  incrementToday,
} from "@/app/lib/note/publishing/queue";
import { draftBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";

export type DailyXResult = {
  skipped?: boolean;
  reason?: string;
  clusterId?: string;
  generated: number;
  scheduledDraftId?: string;
  slackDelivered?: boolean;
  slackError?: string;
};

export async function runDailyXAutomation(): Promise<DailyXResult> {
  if (process.env.X_DAILY_AUTOMATION_ENABLED !== "true") {
    return {
      skipped: true,
      reason: "X_DAILY_AUTOMATION_ENABLED が true ではありません",
      generated: 0,
    };
  }

  const [settings, clusters, items, experiences, brandFile, ideaFile, existingDrafts] =
    await Promise.all([
      loadResearchSettings(),
      loadClusters(),
      loadResearchInbox(),
      loadExperiences(),
      loadBrand(),
      loadIdeas(),
      loadSocialDrafts(),
    ]);

  const cluster = clusters
    .filter((candidate) => candidate.status === "candidate" && !candidate.blocked)
    .sort((left, right) => right.totalScore - left.totalScore)[0];

  if (!cluster) {
    const slack = await postToSlack("本日のX投稿候補はありませんでした。リサーチ結果を確認してください。");
    return {
      skipped: true,
      reason: "利用可能な候補がありません",
      generated: 0,
      slackDelivered: slack.ok,
      slackError: slack.error,
    };
  }

  const genreId = cluster.genreIds[0] ?? DEFAULT_GENRES[0].id;
  const genre =
    ideaFile.genres.find((candidate) => candidate.id === genreId) ??
    DEFAULT_GENRES.find((candidate) => candidate.id === genreId) ??
    DEFAULT_GENRES[0];
  const account = accountForGenre(brandFile.xAccounts, genre.id) ?? brandFile.xAccounts[0];
  if (!account) throw new Error("Xアカウント設定がありません");

  const result = await generateXPosts({
    cluster,
    items: items.filter((item) => cluster.researchItemIds.includes(item.id)),
    experiences: usableExperiences(experiences, cluster.matchedExperienceIds),
    brand: brandFile.brand,
    genre,
    account,
    purpose: "reach",
    pastPosts: existingDrafts.map((draft) => ({
      label: `過去投稿(${draft.id})`,
      text: draft.text,
    })),
  });
  if (result.drafts.length === 0) {
    throw new Error(result.warning ?? "X投稿案を生成できませんでした");
  }

  let drafts = [...result.drafts, ...existingDrafts];
  await saveSocialDrafts(drafts);
  await saveClusters(
    clusters.map((candidate) =>
      candidate.id === cluster.id ? { ...candidate, status: "used" as const } : candidate
    )
  );

  let scheduledDraftId: string | undefined;
  let scheduleMessage = "Slackで内容を確認し、「Bufferへ予約」を押してください。";
  const safeDraft = result.drafts.find((draft) => !draft.failureReason);

  if (settings.flags.publishingEnabled && settings.flags.xAutoPublish && safeDraft) {
    if (!isBufferConfigured()) {
      scheduleMessage = "自動予約は行いませんでした: Bufferの環境変数が未設定です。";
    } else {
      const limit = await canPublishToday("x", settings.flags.maxXPostsPerDay);
      const idempotencyKey = `daily-x:${new Date().toISOString().slice(0, 10)}:${safeDraft.id}`;
      if (!limit.allowed) {
        scheduleMessage = `自動予約は行いませんでした: 本日の上限（${settings.flags.maxXPostsPerDay}件）です。`;
      } else if (!(await claimOnce(idempotencyKey))) {
        scheduleMessage = "本日の自動予約はすでに実行済みです。";
      } else {
        const post = await createPost({
          text: safeDraft.text,
          mode: "addToQueue",
          maxScheduled: settings.flags.maxBufferScheduled,
        });
        if (post.ok) {
          scheduledDraftId = safeDraft.id;
          const now = new Date().toISOString();
          drafts = drafts.map((draft) =>
            draft.id === safeDraft.id
              ? {
                  ...draft,
                  status: "queued" as const,
                  bufferPostId: post.data.id,
                  scheduledAt: post.data.dueAt,
                  updatedAt: now,
                }
              : draft
          );
          await saveSocialDrafts(drafts);
          await incrementToday("x");
          await appendHistory({
            id: `h${Date.now().toString(36)}`,
            platform: "x",
            contentId: safeDraft.id,
            action: "毎日自動化でBufferへ予約",
            at: now,
            detail: post.data.dueAt ? `予定 ${post.data.dueAt}` : undefined,
          });
          scheduleMessage = "安全チェックを通過した1件をBufferの次の予約枠へ自動追加しました。";
        } else {
          scheduleMessage = `自動予約は行いませんでした: ${post.error.message}`;
        }
      }
    }
  }

  const slack = await postToSlack(
    [
      `本日のX投稿案を${result.drafts.length}件作成しました。`,
      scheduleMessage,
      result.warning ? `注意: ${result.warning}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    result.drafts.flatMap((draft) => draftBlocks(draft))
  );

  return {
    clusterId: cluster.id,
    generated: result.drafts.length,
    scheduledDraftId,
    slackDelivered: slack.ok,
    slackError: slack.error,
  };
}

