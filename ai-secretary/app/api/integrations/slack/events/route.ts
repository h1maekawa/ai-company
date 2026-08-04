import {
  candidateBlocks,
  editorialBriefBlocks,
  generationChoiceBlocks,
  postToSlack,
  viewpointConfirmationBlocks,
} from "@/app/lib/integrations/slack/blocks";
import { classifyConversation, cleanSlackMessage } from "@/app/lib/integrations/slack/conversation";
import { generateCandidateInBackground } from "@/app/lib/integrations/slack/generate";
import { buildEditorialBrief } from "@/app/lib/integrations/slack/editorial-brief";
import {
  loadEditorialContext,
  newEditorialContext,
  saveEditorialContext,
  viewpointText,
} from "@/app/lib/integrations/slack/editorial-context";
import {
  captureViewpoint,
  editorialQuestions,
  viewpointSummary,
} from "@/app/lib/integrations/slack/editorial-questions";
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
  const cleanedText = cleanSlackMessage(text);
  const currentContext = await loadEditorialContext(channel, threadTs);

  const intent = classifyConversation(text);
  if (
    currentContext?.status === "awaiting-viewpoint" &&
    intent.type !== "research" &&
    intent.type !== "publish" &&
    cleanedText.length >= 2
  ) {
    const question = currentContext.questions[currentContext.currentQuestionIndex];
    if (!question) return reply("質問を確認できませんでした。もう一度ニュースを選んでください。", channel, threadTs);
    const answers = [
      ...currentContext.answers.filter((answer) => answer.questionId !== question.id),
      { questionId: question.id, rawText: cleanedText.slice(0, 2000), answeredAt: new Date().toISOString() },
    ];
    const nextIndex = currentContext.currentQuestionIndex + 1;
    if (nextIndex < currentContext.questions.length) {
      await saveEditorialContext(channel, threadTs, {
        ...currentContext,
        answers,
        currentQuestionIndex: nextIndex,
      });
      return reply(currentContext.questions[nextIndex].question, channel, threadTs);
    }
    const authorViewpoint = captureViewpoint(answers);
    await saveEditorialContext(channel, threadTs, {
      ...currentContext,
      status: "awaiting-viewpoint-confirmation",
      answers,
      authorViewpoint,
    });
    return postToSlack(
      viewpointSummary(authorViewpoint),
      viewpointConfirmationBlocks(authorViewpoint, currentContext.selectedCandidateId ?? currentContext.brief?.id ?? "viewpoint"),
      { channel, threadTs }
    );
  }

  if (intent.type === "confirm-viewpoint") {
    if (!currentContext?.authorViewpoint || currentContext.status !== "awaiting-viewpoint-confirmation") {
      return reply("確認待ちの考えがありません。先にニュースを選び、質問へ答えてください。", channel, threadTs);
    }
    const confirmed = { ...currentContext.authorViewpoint, confirmedByUser: true };
    await saveEditorialContext(channel, threadTs, {
      ...currentContext,
      status: "ready-to-generate",
      authorViewpoint: confirmed,
      viewpointConfirmedAt: new Date().toISOString(),
    });
    return postToSlack(
      "✅ 本人の考えとして確認しました。今回はこの下書きだけに使用し、ブランド情報や体験へ自動登録しません。",
      generationChoiceBlocks(currentContext.selectedCandidateId!),
      { channel, threadTs }
    );
  }

  if (intent.type === "edit-viewpoint") {
    if (!currentContext?.selectedCandidateId) {
      return reply("修正する考えがありません。先にニュースを選んでください。", channel, threadTs);
    }
    await saveEditorialContext(channel, threadTs, {
      ...currentContext,
      status: "awaiting-viewpoint",
      questions: [{
        id: "opinion",
        category: "opinion",
        question: "修正後の考えを、普段の言葉でそのまま送ってください。",
        required: true,
      }],
      currentQuestionIndex: 0,
      answers: [],
      authorViewpoint: undefined,
      viewpointConfirmedAt: undefined,
    });
    return reply("修正後の考えを、普段の言葉でそのまま送ってください。", channel, threadTs);
  }

  if (intent.type === "select") {
    const context = currentContext;
    const selectedId = context?.candidateIds[intent.candidateNumber - 1];
    if (!context || !selectedId) {
      return reply(
        "その候補を確認できませんでした。先に調べたいテーマを話しかけてください。",
        channel,
        threadTs
      );
    }
    const selected = (await loadClusters()).find((candidate) => candidate.id === selectedId);
    if (!selected) {
      return reply("その候補は見つかりませんでした。もう一度リサーチしてください。", channel, threadTs);
    }
    const questions = editorialQuestions({ title: selected.title, genreIds: selected.genreIds });
    await saveEditorialContext(channel, threadTs, {
      ...context,
      status: "awaiting-viewpoint",
      selectedCandidateId: selected.id,
      selectedNewsItemId: selected.id,
      authorViewpoint: undefined,
      questions,
      currentQuestionIndex: 0,
      answers: [],
    });
    return reply(
      `「${selected.title}」を選びました。\n\n${questions[0].question}\n\n一つずつで大丈夫です。「まだ分からない」も、そのまま回答してください。`,
      channel,
      threadTs
    );
  }

  if (intent.type === "generate") {
    const clusters = (await loadClusters()).filter(
      (candidate) =>
        (candidate.status === "candidate" || candidate.status === "selected") &&
        !candidate.blocked
    );
    const topic = intent.topic?.toLowerCase();
    let matching;
    if (topic) {
      matching = clusters.filter((candidate) =>
        `${candidate.title} ${candidate.summary}`.toLowerCase().includes(topic)
      );
    } else {
      // 「一番上」は保存済み全候補ではなく、このSlack会話で直前に表示した候補を指す。
      const context = currentContext;
      const clusterById = new Map(clusters.map((candidate) => [candidate.id, candidate]));
      const orderedIds = context?.selectedCandidateId
        ? [context.selectedCandidateId, ...context.candidateIds.filter((id) => id !== context.selectedCandidateId)]
        : context?.candidateIds ?? [];
      matching = orderedIds
        .map((id) => clusterById.get(id))
        .filter((candidate): candidate is (typeof clusters)[number] => Boolean(candidate));
    }
    const index = (intent.candidateNumber ?? 1) - 1;
    const selected = matching[index];

    if (!selected) {
      const subject = intent.topic ? `「${intent.topic}」` : "指定された";
      return reply(
        `${subject}候補がまだありません。\n先に「${intent.topic ?? "半導体"}について調べて」と話しかけてください。候補が届いたら「一番上でX案を作って」のように続けられます。`,
        channel,
        threadTs
      );
    }
    const context = currentContext;
    if (!context?.authorViewpoint?.confirmedByUser) {
      const questions = editorialQuestions({ title: selected.title, genreIds: selected.genreIds });
      await saveEditorialContext(channel, threadTs, newEditorialContext({
        ...(context ?? {}),
        status: "awaiting-viewpoint",
        candidateIds: context?.candidateIds?.length ? context.candidateIds : matching.map((candidate) => candidate.id),
        selectedCandidateId: selected.id,
        selectedNewsItemId: selected.id,
        questions,
        currentQuestionIndex: 0,
        answers: [],
        authorViewpoint: undefined,
      }));
      return reply(
        `まだ投稿は作りません。\n「${selected.title}」について、まず前川さんの考えを確認します。\n\n${questions[0].question}`,
        channel,
        threadTs
      );
    }

    const destination =
      intent.kind === "x" ? "X投稿案" : intent.kind === "note" ? "note下書き" : "Xとnoteの下書き";
    await reply(
      `✍️ 受付しました。「${selected.title}」から${destination}を作っています。\n外部公開はせず、確認用の下書きとして保存します。`,
      channel,
      threadTs
    );
    await generateCandidateInBackground(
      selected.id,
      intent.kind,
      intent.articleType,
      { channel, threadTs },
      {
        text: viewpointText(context.authorViewpoint),
        confirmedByUser: context.authorViewpoint.confirmedByUser,
      }
    );
    return;
  }

  if (intent.type === "research") {
    if (intent.topic) {
      const settings = await loadResearchSettings();
      await saveResearchSettings({
        ...settings,
        noteTags:
          intent.destination === "x"
            ? settings.noteTags
            : [...new Set([intent.topic, ...settings.noteTags])].slice(0, 20),
        x: {
          ...settings.x,
          keywords:
            intent.destination === "note"
              ? settings.x.keywords
              : [...new Set([intent.topic, ...settings.x.keywords])].slice(0, 20),
        },
      });
    }
    const destinationLabel =
      intent.destination === "x" ? "X投稿用" : intent.destination === "note" ? "note記事用" : "X・note両方";
    await reply(
      intent.topic
        ? `🔎 受付しました。${destinationLabel}に「${intent.topic}」を調べています。\n通常1〜3分ほどです。終わったら候補をここへ表示します。`
        : `🔎 受付しました。${destinationLabel}のリサーチ中です。\n通常1〜3分ほどです。終わったら候補をここへ表示します。`,
      channel,
      threadTs
    );
    const result = await withLock("research-run", () =>
      runResearch({ focusTopic: intent.topic, platform: intent.destination })
    );
    if (!result) return reply("別のリサーチが進行中です。終わってから結果を確認してください。", channel, threadTs);
    const items = await loadResearchInbox();
    const brief = buildEditorialBrief({
      topic: intent.topic,
      destination: intent.destination,
      candidates: result.topCandidates,
      items,
    });
    const blocks = editorialBriefBlocks(brief, items);
    await saveEditorialContext(channel, threadTs, newEditorialContext({
      status: "awaiting-topic-selection",
      brief,
      candidateIds: result.topCandidates.map((candidate) => candidate.id),
      topic: intent.topic,
      destination: intent.destination,
    }));
    return postToSlack(
      result.topCandidates.length > 0
        ? `✅ ${destinationLabel}「${intent.topic ?? "指定テーマ"}」のリサーチ完了：新規${result.newItems}件、関連候補${result.topCandidates.length}件`
        : `調査は完了しましたが、${destinationLabel}の「${intent.topic ?? "指定テーマ"}」に直接関係する新しい候補は見つかりませんでした。以前の候補は混ぜずに停止しました。`,
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
    await saveEditorialContext(channel, threadTs, newEditorialContext({
      status: "awaiting-topic-selection",
      candidateIds: top.map((candidate) => candidate.id),
    }));
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
    "普通の言葉で話しかけてください。\n\n例：\n• 半導体について調べて\n• 今日のAIニュースを見せて\n• 2番目のニュースが気になる\n• 私はこう思う\n• この考えでXを作って\n• この考えをnoteにして\n• 下書きを見せて\n\n私は、まずニュースを整理して質問します。前川さんの考えを確認してから、Xやnoteの下書きを作ります。\n\n本人の確認なしに、意見や体験を作ることはありません。",
    channel,
    threadTs
  );
}
