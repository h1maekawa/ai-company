import { accountForGenre, DEFAULT_GENRES } from "@/app/lib/note/types";
import { loadBrand, loadIdeas } from "@/app/lib/note/store";
import { usableExperiences } from "@/app/lib/note/research/experience";
import { generateXPosts } from "@/app/lib/note/research/generate";
import { tryGenerateInvestmentDraft } from "@/app/lib/note/investing/xBridge";
import { loadStyleProfile } from "@/app/lib/note/styleProfile";
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
import { prepareXDraftForPublishing } from "@/app/lib/note/safetyRepair";
import {
  canPublishToday,
  claimOnce,
  incrementToday,
} from "@/app/lib/note/publishing/queue";
import { draftBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import {
  DEFAULT_X_SCHEDULE,
  scheduledAtInTokyo,
} from "@/app/lib/note/operations";
import type { SocialDraft } from "@/app/lib/note/research/types";

export type DailyXResult = {
  skipped?: boolean;
  reason?: string;
  clusterId?: string;
  generated: number;
  scheduledDraftId?: string;
  scheduledDraftIds?: string[];
  safetyBlocked?: number;
  /** Human Escalation（要件P1.6）: 異常検知でSlackへ送った場合のみtrue */
  escalated?: boolean;
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

  const [settings, clusters, items, experiences, brandFile, ideaFile, existingDrafts, styleProfile] =
    await Promise.all([
      loadResearchSettings(),
      loadClusters(),
      loadResearchInbox(),
      loadExperiences(),
      loadBrand(),
      loadIdeas(),
      loadSocialDrafts(),
      loadStyleProfile(),
    ]);

  const candidates = clusters.filter((candidate) => candidate.status === "candidate" && !candidate.blocked);
  const tokyoDayNumber = Number(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(8, 10));
  const explorationDay = tokyoDayNumber % 5 === 0; // 約20%は新しいTopic/Patternを探索する。
  const cluster = candidates.sort((left, right) => {
    if (explorationDay) return right.totalScore - left.totalScore;
    const priority = (candidate: typeof left) => {
      const topic = settings.growthStrategy.topicPriority.indexOf(candidate.id);
      const genre = Math.min(...candidate.genreIds.map((id) => {
        const index = settings.growthStrategy.genrePriority.indexOf(id);
        return index < 0 ? 99 : index;
      }), 99);
      return (topic < 0 ? 99 : topic) * 100 + genre;
    };
    return priority(left) - priority(right) || right.totalScore - left.totalScore;
  })[0];

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

  const usable = usableExperiences(experiences, cluster.matchedExperienceIds);
  const generated: SocialDraft[] = [];
  const warnings: string[] = [];
  for (const slot of DEFAULT_X_SCHEDULE) {
    // 投資→X連携（要件4・13・16）: 信頼枠でだけ試みる。材料が無い/Fact Gate却下なら通常生成へfallback
    if (slot.purpose === "trust" && settings.flags.investmentBridgeEnabled) {
      const investmentDraft = await tryGenerateInvestmentDraft({
        brand: brandFile.brand,
        genre,
        account,
        purpose: slot.purpose,
        pastPosts: [...existingDrafts, ...generated].map((draft) => ({
          label: `過去投稿(${draft.id})`,
          text: draft.text,
        })),
        styleProfile,
      }).catch((error) => {
        console.error("[daily-x] 投資→X連携に失敗。通常投稿へfallbackします:", error);
        return null;
      });
      if (investmentDraft) {
        generated.push(investmentDraft);
        continue;
      }
    }
    const result = await generateXPosts({
      cluster,
      items: items.filter((item) => cluster.researchItemIds.includes(item.id)),
      experiences: usable,
      brand: brandFile.brand,
      genre,
      account,
      purpose: slot.purpose,
      pastPosts: [...existingDrafts, ...generated].map((draft) => ({
        label: `過去投稿(${draft.id})`,
        text: draft.text,
      })),
      preferredPatterns: settings.growthStrategy.patternPriority,
      styleProfile,
    });
    const candidate = result.drafts.find((draft) => !draft.failureReason);
    if (candidate) generated.push(candidate);
    if (result.warning) warnings.push(result.warning);
  }
  if (generated.length === 0) throw new Error(warnings[0] ?? "X投稿案を生成できませんでした");

  const gated = [];
  for (const draft of generated) {
    const prepared = await prepareXDraftForPublishing({
      draft,
      brand: brandFile.brand,
      experiences: usable,
    });
    gated.push({ draft: prepared.draft, gate: prepared });
  }
  const prepared = gated.map(({ draft, gate }) =>
    gate.safe ? draft : { ...draft, failureReason: gate.reasons.join(" / ") }
  );
  let drafts = [...prepared, ...existingDrafts];
  await saveSocialDrafts(drafts);
  await saveClusters(
    clusters.map((candidate) =>
      candidate.id === cluster.id ? { ...candidate, status: "used" as const } : candidate
    )
  );

  const scheduledDraftIds: string[] = [];
  const scheduleMessages: string[] = [];
  const safeDrafts = prepared.filter((draft) => !draft.failureReason).slice(0, 3);

  if (settings.flags.publishingEnabled && settings.flags.xAutoPublish && safeDrafts.length > 0) {
    if (!isBufferConfigured()) {
      scheduleMessages.push("自動予約は行いませんでした: Bufferの環境変数が未設定です。");
    } else {
      for (const safeDraft of safeDrafts) {
        const slot =
          DEFAULT_X_SCHEDULE.find((candidate) => candidate.purpose === safeDraft.purpose) ??
          DEFAULT_X_SCHEDULE[0];
        const limit = await canPublishToday("x", settings.flags.maxXPostsPerDay);
        if (!limit.allowed) {
          scheduleMessages.push(`上限到達: ${slot.time}（${settings.flags.maxXPostsPerDay}件/日）`);
          break;
        }
        let scheduledAt = scheduledAtInTokyo(new Date(), slot.time);
        if (new Date(scheduledAt).getTime() <= Date.now()) {
          scheduledAt = scheduledAtInTokyo(new Date(Date.now() + 86_400_000), slot.time);
        }
        const tokyoDay = new Date(new Date(scheduledAt).getTime() + 9 * 3_600_000)
          .toISOString()
          .slice(0, 10);
        const idempotencyKey = `daily-x:${tokyoDay}:${slot.time}`;
        if (!(await claimOnce(idempotencyKey))) {
          scheduleMessages.push(`予約済み: ${slot.time}`);
          continue;
        }
        const post = await createPost({
          draft: safeDraft,
          safetyContext: { brand: brandFile.brand, experiences: usable },
          mode: "customScheduled",
          scheduledAt,
          maxScheduled: settings.flags.maxBufferScheduled,
        });
        if (post.ok) {
          scheduledDraftIds.push(safeDraft.id);
          const now = new Date().toISOString();
          drafts = drafts.map((draft) =>
            draft.id === safeDraft.id
              ? {
                  ...draft,
                  status: "queued" as const,
                  bufferPostId: post.data.id,
                  scheduledAt: post.data.dueAt ?? scheduledAt,
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
            detail: `${slot.role} / 予定 ${post.data.dueAt ?? scheduledAt}`,
          });
          scheduleMessages.push(`予約完了: ${slot.time} ${slot.role}`);
        } else {
          scheduleMessages.push(`予約失敗 ${slot.time}: ${post.error.message}`);
        }
      }
    }
  } else if (!settings.flags.publishingEnabled || !settings.flags.xAutoPublish) {
    scheduleMessages.push("自動投稿フラグがOFFのため下書き保存で停止しました。");
  }

  // Human Escalation（要件P1.6）: 通常成功時は毎回通知しない。異常時のみSlackへ送る。
  // 通常の実行結果はWeekly CEO Reportへ集約する。
  const safetyBlocked = prepared.filter((draft) => Boolean(draft.failureReason)).length;
  const bufferFailureCount = scheduleMessages.filter((m) => m.startsWith("予約失敗")).length;
  const bufferAuthOrConfigError = scheduleMessages.some(
    (m) => m.includes("未設定です") || m.includes("認証")
  );
  const secretOrPersonalDataDetected = prepared.some(
    (draft) => draft.failureReason?.includes("機密情報") || draft.failureReason?.includes("個人情報")
  );
  const escalate =
    safetyBlocked > 0 || bufferFailureCount >= 2 || bufferAuthOrConfigError || secretOrPersonalDataDetected;

  let slack: { ok: boolean; error?: string } = { ok: true };
  if (escalate) {
    slack = await postToSlack(
      [
        "⚠️ SNS事業部 異常検知",
        `本日のX投稿案を${prepared.length}件作成しました。`,
        scheduleMessages.join(" / "),
        warnings.length > 0 ? `注意: ${[...new Set(warnings)].join(" / ")}` : "",
        safetyBlocked > 0 ? `Safety/Fact Gateで${safetyBlocked}件却下しました。` : "",
        secretOrPersonalDataDetected ? "機密情報・個人情報らしき文字列を検出したため却下しました。" : "",
      ]
        .filter(Boolean)
        .join("\n"),
      prepared.flatMap((draft) => draftBlocks(draft))
    );
  }

  return {
    clusterId: cluster.id,
    generated: prepared.length,
    scheduledDraftId: scheduledDraftIds[0],
    scheduledDraftIds,
    safetyBlocked,
    escalated: escalate,
    slackDelivered: slack.ok,
    slackError: slack.error,
  };
}
