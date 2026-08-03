import { candidateBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";
import { classifyConversation } from "@/app/lib/integrations/slack/conversation";
import { verifySlackRequest } from "@/app/lib/integrations/slack/verify";
import { runInBackground } from "@/app/lib/integrations/vercel-background";
import { latestDraftLink } from "@/app/lib/note/drafts/mobile";
import { withLock, claimOnce } from "@/app/lib/note/publishing/queue";
import { runResearch } from "@/app/lib/note/research/run";
import {
  loadClusters,
  loadExperiences,
  loadNoteQueue,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
  saveResearchSettings,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SlackEventPayload = {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    text?: string;
    channel?: string;
    channel_type?: string;
    thread_ts?: string;
    ts?: string;
  };
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const verified = await verifySlackRequest(
    raw,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature")
  );
  if (!verified.ok) return json({ error: verified.reason }, 401);

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(raw) as SlackEventPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (payload.type === "url_verification") return json({ challenge: payload.challenge });

  const event = payload.event;
  const supported =
    event?.type === "app_mention" ||
    (event?.type === "message" && event.channel_type === "im");
  if (!supported || event?.subtype || event?.bot_id || !event.channel || !event.text) {
    return json({ ok: true });
  }
  if (payload.event_id && !(await claimOnce(`slack-event:${payload.event_id}`))) {
    return json({ ok: true, deduped: true });
  }

  const channel = event.channel;
  // 新しいメンションへの返答を自動でスレッドへ隠さない。
  // すでにスレッド内で話しかけられた場合だけ、そのスレッドへ返す。
  const threadTs = event.thread_ts;
  runInBackground(
    handleConversation(event.text, channel, threadTs).catch(async (error) => {
      console.error("[slack/events] 会話処理失敗", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await postToSlack("処理に失敗しました。少し待ってから、もう一度話しかけてください。", undefined, { channel, threadTs });
    })
  );
  return json({ ok: true });
}

async function reply(text: string, channel: string, threadTs?: string) {
  const result = await postToSlack(text, undefined, { channel, threadTs });
  if (!result.ok) throw new Error(`Slackへの返信に失敗: ${result.error ?? "unknown"}`);
  return result;
}

async function handleConversation(text: string, channel: string, threadTs?: string) {
  const intent = classifyConversation(text);
  if (intent.type === "research") {
    if (intent.topic) {
      const settings = await loadResearchSettings();
      await saveResearchSettings({
        ...settings,
        noteTags: [...new Set([intent.topic, ...settings.noteTags])].slice(0, 20),
        x: {
          ...settings.x,
          keywords: [...new Set([intent.topic, ...settings.x.keywords])].slice(0, 20),
        },
      });
    }
    await reply(
      intent.topic
        ? `🔎 受付しました。「${intent.topic}」を調べています。\n通常1〜3分ほどです。終わったら候補をここへ表示します。`
        : "🔎 受付しました。リサーチ中です。\n通常1〜3分ほどです。終わったら候補をここへ表示します。",
      channel,
      threadTs
    );
    const result = await withLock("research-run", runResearch);
    if (!result) return reply("別のリサーチが進行中です。終わってから結果を確認してください。", channel, threadTs);
    const [items, experiences] = await Promise.all([loadResearchInbox(), loadExperiences()]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const experienceById = new Map(experiences.map((item) => [item.id, item]));
    const blocks = result.topCandidates.flatMap((candidate) =>
      candidateBlocks(
        candidate,
        candidate.researchItemIds.map((id) => itemById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
        candidate.matchedExperienceIds.map((id) => experienceById.get(id)?.title).filter((title): title is string => Boolean(title))
      )
    );
    return postToSlack(
      `✅ リサーチ完了：新規${result.newItems}件、候補${result.topCandidates.length}件`,
      blocks.length ? blocks : undefined,
      { channel, threadTs }
    );
  }

  if (intent.type === "candidates") {
    const [clusters, items, experiences] = await Promise.all([loadClusters(), loadResearchInbox(), loadExperiences()]);
    const top = clusters.filter((item) => item.status === "candidate" && !item.blocked).slice(0, 5);
    if (!top.length) return reply("候補はまだありません。「半導体について調べて」のように話しかけてください。", channel, threadTs);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const experienceById = new Map(experiences.map((item) => [item.id, item]));
    return postToSlack(
      `現在の候補 ${top.length}件です。`,
      top.flatMap((candidate) => candidateBlocks(
        candidate,
        candidate.researchItemIds.map((id) => itemById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
        candidate.matchedExperienceIds.map((id) => experienceById.get(id)?.title).filter((title): title is string => Boolean(title))
      )),
      { channel, threadTs }
    );
  }

  if (intent.type === "queue") {
    const [drafts, queue] = await Promise.all([loadSocialDrafts(), loadNoteQueue()]);
    return reply(
      `現在の状況です。\n• X下書き：${drafts.filter((item) => item.status === "draft").length}件\n• note下書き：${queue.articles.filter((item) => item.status === "draft").length}件\n• 未実行ジョブ：${queue.jobs.filter((item) => item.status === "pending").length}件`,
      channel,
      threadTs
    );
  }

  if (intent.type === "draft") {
    const draft = await latestDraftLink();
    return reply(
      draft
        ? `最新の全文はこちらです。スマホで読みやすい確認ページを開きます。\n${draft.url}`
        : "保存済みの全文がまだありません。Note事業部の「完成原稿を登録」から保存できます。",
      channel,
      threadTs
    );
  }

  if (intent.type === "settings") {
    const settings = await loadResearchSettings();
    return reply(
      `安全設定です。\n• 投稿全体：${settings.flags.publishingEnabled ? "ON" : "OFF"}\n• X自動投稿：${settings.flags.xAutoPublish ? "ON" : "OFF"}\n• note自動公開：${settings.flags.noteAutoPublish ? "ON" : "OFF"}\n• note下書きのみ：${settings.flags.noteDraftOnly ? "ON" : "OFF"}`,
      channel,
      threadTs
    );
  }

  if (intent.type === "publish") {
    const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
    return reply(
      `誤投稿防止のため、会話だけでは公開しません。内容を確認して、本人が次の画面から承認してください。\n${base}/note`,
      channel,
      threadTs
    );
  }

  return reply(
    "普通の言葉で話しかけてください。たとえば：\n• 半導体について調べて\n• 今の候補を見せて\n• 最新の記事全文を見せて\n• 下書きの状況を教えて\n• 自動投稿の設定を教えて",
    channel,
    threadTs
  );
}
