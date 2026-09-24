import { accountForGenre, DEFAULT_GENRES } from "@/app/lib/note/types";
import { loadBrand, loadIdeas } from "@/app/lib/note/store";
import { usableExperiences } from "@/app/lib/note/research/experience";
import { generateXPosts } from "@/app/lib/note/research/generate";
import { tryGenerateInvestmentDraft } from "@/app/lib/note/investing/xBridge";
import { loadStyleProfile } from "@/app/lib/note/styleProfile";
import { filterHotConfidenceCandidates } from "@/app/lib/note/research/cluster";
import {
  appendHistory,
  loadClusters,
  loadDailyXPlans,
  loadExperiences,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
  saveClusters,
  saveSocialDrafts,
  upsertDailyXPlan,
} from "@/app/lib/note/research/store";
import { createPost, isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { prepareXDraftForPublishing } from "@/app/lib/note/safetyRepair";
import {
  claimStrict,
  countForTokyoDate,
  incrementForTokyoDate,
  releaseClaim,
} from "@/app/lib/note/publishing/queue";
import { draftBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import type { DailyXPlanSlot, SocialDraft, TrendCluster } from "@/app/lib/note/research/types";
import { recordPipelineSteps } from "@/app/lib/agents/recorder";
import { startTrace } from "@/app/lib/company/trace";
import { executeDailyXPlan, type DailyXResult } from "./dailyXExecution";

export type { DailyXResult } from "./dailyXExecution";
export { executeDailyXPlan } from "./dailyXExecution";

/** x-daily-publish route の maxDuration(300) + 60s。処理中にLockが切れて二重起動しないようにする */
export const DAILY_X_LOCK_TTL_SEC = 360;

/** Phase 0 は Buffer channel が env の単一channelのため primary 固定 */
const ACCOUNT_KEY = "primary";

/**
 * 毎日のX自動化。依存を束ねて executeDailyXPlan（Plan駆動・retry安全）を呼ぶだけにする。
 * Safety Gate / Fact Gate / Buffer final safety / 運用モードの意味は変更しない。
 */
export async function runDailyXAutomation(): Promise<DailyXResult> {
  if (process.env.X_DAILY_AUTOMATION_ENABLED !== "true") {
    return {
      skipped: true,
      reason: "X_DAILY_AUTOMATION_ENABLED が true ではありません",
      generated: 0,
    };
  }

  const trace = startTrace({ departmentId: "note", workflowId: "daily-x-automation" });
  const logPhaseDuration = (phase: string, startedAt: number) => {
    console.info("[daily-x][timing]", {
      traceId: trace.traceId,
      phase,
      durationMs: Date.now() - startedAt,
    });
  };
  /** 依存呼び出しの所要時間だけを記録する（本文・秘密は出さない） */
  const timed = <A extends unknown[], R>(phase: string, fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    const startedAt = Date.now();
    try { return await fn(...args); } finally { logPhaseDuration(phase, startedAt); }
  };
  const loadContextStartedAt = Date.now();
  const [settings, items, experiences, brandFile, ideaFile, styleProfile] = await Promise.all([
    loadResearchSettings(),
    loadResearchInbox(),
    loadExperiences(),
    loadBrand(),
    loadIdeas(),
    loadStyleProfile(),
  ]);
  logPhaseDuration("load-context", loadContextStartedAt);
  const primaryAccount = brandFile.xAccounts[0];
  if (!primaryAccount) throw new Error("Xアカウント設定がありません");
  // 生成済み（同一Run）も類似チェックの対象に含める
  const generatedThisRun: SocialDraft[] = [];

  const result = await executeDailyXPlan(
    {
      accountKey: ACCOUNT_KEY,
      strategy: settings.growthStrategy,
      maxXPostsPerDay: settings.flags.maxXPostsPerDay,
      autopilot: settings.flags.publishingEnabled && settings.flags.xAutoPublish,
      bufferConfigured: isBufferConfigured(),
      primaryAccountId: primaryAccount.id,
    },
    {
      now: () => new Date(),
      loadPlan: async (date, accountKey) => (await loadDailyXPlans()).find((plan) => plan.date === date && plan.accountKey === accountKey) ?? null,
      savePlan: async (plan) => { await upsertDailyXPlan(plan); },
      loadCandidates: timed("candidate-select", async () => {
        const eligible = (await loadClusters()).filter((candidate) => candidate.status === "candidate" && !candidate.blocked);
        // 全件Legacyなら旧スコアへfallback。新旧混在時はLegacyを紛れ込ませず、MEDIUM/HIGHだけを使う。
        return { eligibleCount: eligible.length, candidates: filterHotConfidenceCandidates(eligible) };
      }),
      findCluster: async (id) => (await loadClusters()).find((cluster) => cluster.id === id) ?? null,
      markClustersUsed: async (ids) => {
        const clusters = await loadClusters();
        if (!clusters.some((cluster) => ids.includes(cluster.id) && cluster.status !== "used")) return;
        await saveClusters(clusters.map((cluster) => (ids.includes(cluster.id) ? { ...cluster, status: "used" as const } : cluster)));
      },
      generateForSlot: timed("generate", async (slot: DailyXPlanSlot, cluster: TrendCluster) => {
        const genreId = cluster.genreIds[0] ?? DEFAULT_GENRES[0].id;
        const genre =
          ideaFile.genres.find((candidate) => candidate.id === genreId) ??
          DEFAULT_GENRES.find((candidate) => candidate.id === genreId) ??
          DEFAULT_GENRES[0];
        const account = accountForGenre(brandFile.xAccounts, genre.id) ?? primaryAccount;
        const usable = usableExperiences(experiences, cluster.matchedExperienceIds);
        const existingDrafts = await loadSocialDrafts();
        const pastPosts = [...existingDrafts, ...generatedThisRun].map((draft) => ({ label: `過去投稿(${draft.id})`, text: draft.text }));
        // 投資→X連携（要件4・13・16）: trust枠でだけ試みる。材料が無い/Fact Gate却下なら通常生成へfallback
        if (slot.purpose === "trust" && settings.flags.investmentBridgeEnabled) {
          const investmentDraft = await tryGenerateInvestmentDraft({ brand: brandFile.brand, genre, account, purpose: slot.purpose, pastPosts, styleProfile }).catch((error) => {
            console.error("[daily-x] 投資→X連携に失敗。通常投稿へfallbackします:", error);
            return null;
          });
          if (investmentDraft) { generatedThisRun.push(investmentDraft); return { draft: investmentDraft }; }
        }
        const generated = await generateXPosts({
          cluster,
          items: items.filter((item) => cluster.researchItemIds.includes(item.id)),
          experiences: usable,
          brand: brandFile.brand,
          genre,
          account,
          purpose: slot.purpose,
          pastPosts,
          preferredPatterns: settings.growthStrategy.patternPriority,
          styleProfile,
        });
        const draft = generated.drafts.find((candidate) => !candidate.failureReason) ?? null;
        if (draft) generatedThisRun.push(draft);
        return { draft, warning: generated.warning };
      }),
      safetyGate: timed("safety-gate", async (draft: SocialDraft) => {
        const cluster = (await loadClusters()).find((item) => item.id === draft.trendClusterId);
        const prepared = await prepareXDraftForPublishing({ draft, brand: brandFile.brand, experiences: usableExperiences(experiences, cluster?.matchedExperienceIds ?? []) });
        return { draft: prepared.draft, safe: prepared.safe, reasons: prepared.reasons };
      }),
      loadDrafts: loadSocialDrafts,
      saveDrafts: timed("save-drafts", async (drafts: SocialDraft[]) => { await saveSocialDrafts(drafts); }),
      claimStrict: (key) => claimStrict(key),
      releaseClaim: (key) => releaseClaim(key),
      countForTokyoDate: (dateKey) => countForTokyoDate("x", dateKey, { strict: true }),
      incrementForTokyoDate: (dateKey) => incrementForTokyoDate("x", dateKey),
      createPost: timed("buffer-schedule", async (draft: SocialDraft, scheduledAt: string) => {
        const cluster = (await loadClusters()).find((item) => item.id === draft.trendClusterId);
        return createPost({
          draft,
          safetyContext: { brand: brandFile.brand, experiences: usableExperiences(experiences, cluster?.matchedExperienceIds ?? []) },
          mode: "customScheduled",
          scheduledAt,
          maxScheduled: settings.flags.maxBufferScheduled,
        });
      }),
      appendHistory: (entry) => appendHistory(entry),
      notifySlack: (text, drafts) => postToSlack(text, drafts.flatMap((draft) => draftBlocks(draft))),
      logError: (message, detail) => console.error(message, JSON.stringify(detail)),
    }
  );

  await recordPipelineSteps(
    [
      { stepId: "research.select", status: result.planId ? "done" : "failed", ...(result.planId ? { result: `Plan ${result.planId}` } : { failureReason: result.reason ?? "Planを作成できませんでした" }) },
      { stepId: "writer.generate", status: "done", result: `投稿案を${result.generated}件生成` },
      { stepId: "fact_check.gate", status: "done", result: `Safety/Fact Gate却下 ${result.safetyBlocked ?? 0}件` },
      (result.scheduledDraftIds?.length ?? 0) > 0
        ? { stepId: "publisher.schedule", status: "done", result: `${result.scheduledDraftIds!.length}件をBufferへ予約` }
        : { stepId: "publisher.schedule", status: "failed", failureReason: result.haltedReason ?? result.reason ?? "予約しませんでした" },
    ],
    trace
  ).catch((error) => console.error("[daily-x] pipeline記録に失敗（非致命）:", error));

  return result;
}
