import { verifySlackRequest, slackText } from "@/app/lib/integrations/slack/verify";
import { candidateBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import { runResearch } from "@/app/lib/note/research/run";
import { withLock } from "@/app/lib/note/publishing/queue";
import {
  loadClusters,
  loadExperiences,
  loadNoteQueue,
  loadPerformance,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/integrations/slack/commands
 * /maemichi research | candidates | queue | performance | settings
 *
 * middleware は素通しなので、必ず署名検証を通す。
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const verified = await verifySlackRequest(
    raw,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature")
  );
  if (!verified.ok) {
    return new Response(JSON.stringify({ error: verified.reason }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams(raw);
  const sub = (params.get("text") ?? "").trim().split(/\s+/)[0] || "candidates";

  try {
    switch (sub) {
      case "research":
        return await handleResearch();
      case "candidates":
        return await handleCandidates();
      case "queue":
        return await handleQueue();
      case "performance":
        return await handlePerformance();
      case "settings":
        return await handleSettings();
      default:
        return slackText(
          "使い方: `/maemichi research | candidates | queue | performance | settings`"
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました";
    console.error("[slack/commands] 失敗:", error);
    return slackText(`エラー: ${message}`);
  }
}

async function handleResearch(): Promise<Response> {
  // Slackは3秒でタイムアウトするので、先に応答してから裏で走らせる
  void withLock("research-run", async () => {
    const result = await runResearch();
    const [items, experiences] = await Promise.all([loadResearchInbox(), loadExperiences()]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const expById = new Map(experiences.map((e) => [e.id, e]));

    const blocks = result.topCandidates.flatMap((c) =>
      candidateBlocks(
        c,
        c.researchItemIds.map((id) => itemById.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
        c.matchedExperienceIds.map((id) => expById.get(id)?.title).filter((t): t is string => Boolean(t))
      )
    );

    await postToSlack(
      `リサーチが終わりました（新規 ${result.newItems}件 / 候補 ${result.topCandidates.length}件）`,
      blocks.length > 0 ? blocks : undefined
    );
  }).catch((error) => console.error("[slack/commands] research失敗:", error));

  return slackText("リサーチを開始しました。終わったらこのチャンネルへ候補を送ります。");
}

async function handleCandidates(): Promise<Response> {
  const [clusters, items, experiences] = await Promise.all([
    loadClusters(),
    loadResearchInbox(),
    loadExperiences(),
  ]);

  const top = clusters.filter((c) => c.status === "candidate" && !c.blocked).slice(0, 5);
  if (top.length === 0) {
    return slackText("いまは候補がありません。`/maemichi research` で調べ直せます。");
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const expById = new Map(experiences.map((e) => [e.id, e]));
  const blocks = top.flatMap((c) =>
    candidateBlocks(
      c,
      c.researchItemIds.map((id) => itemById.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
      c.matchedExperienceIds.map((id) => expById.get(id)?.title).filter((t): t is string => Boolean(t))
    )
  );

  return new Response(
    JSON.stringify({ response_type: "ephemeral", text: `候補 ${top.length}件`, blocks }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function handleQueue(): Promise<Response> {
  const [drafts, queue] = await Promise.all([loadSocialDrafts(), loadNoteQueue()]);
  const pendingX = drafts.filter((d) => d.status === "draft" || d.status === "queued");
  const scheduled = drafts.filter((d) => d.status === "scheduled");
  const articles = queue.articles.filter((a) => a.status !== "published");

  const lines = [
    `*X下書き* ${pendingX.length}件 / *予約中* ${scheduled.length}件`,
    ...scheduled.slice(0, 5).map((d) => `• ${d.scheduledAt ?? "日時未定"} — ${d.text.slice(0, 40)}…`),
    "",
    `*note記事* ${articles.length}件`,
    ...articles.slice(0, 5).map((a) => `• [${a.status}] ${a.title}`),
    "",
    `*未実行ジョブ* ${queue.jobs.filter((j) => j.status === "pending").length}件`,
  ];

  return slackText(lines.join("\n"));
}

async function handlePerformance(): Promise<Response> {
  const perf = await loadPerformance();
  if (perf.records.length === 0) {
    return slackText("まだ実績が登録されていません。");
  }
  const num = (v?: number) => (typeof v === "number" ? String(v) : "—");
  const lines = [
    "*直近の実績*（—は未取得）",
    ...perf.records
      .slice(0, 8)
      .map(
        (r) =>
          `• ${r.publishedAt.slice(0, 10)} [${r.platform}] imp:${num(r.impressions)} / like:${num(r.likes ?? r.noteLikes)} / click:${num(r.linkClicks ?? r.affiliateClicks)}`
      ),
  ];
  return slackText(lines.join("\n"));
}

async function handleSettings(): Promise<Response> {
  const s = await loadResearchSettings();
  const lines = [
    `*Xリサーチ*: ${s.x.mode} / ${s.x.enabled ? "有効" : "無効"}`,
    `*API予算*: $${s.x.currentEstimatedSpendUsd} / $${s.x.monthlyBudgetUsd}`,
    `*投稿全体*: ${s.flags.publishingEnabled ? "有効" : "停止中"}`,
    `*X自動投稿*: ${s.flags.xAutoPublish ? "ON" : "OFF"}`,
    `*note自動公開*: ${s.flags.noteAutoPublish ? "ON" : "OFF"}（下書きのみ: ${s.flags.noteDraftOnly ? "はい" : "いいえ"}）`,
    `*1日のX上限*: ${s.flags.maxXPostsPerDay}件 / *Buffer予約上限*: ${s.flags.maxBufferScheduled}件`,
    "",
    "変更は Note事業部 の設定画面から行えます。",
  ];
  return slackText(lines.join("\n"));
}
