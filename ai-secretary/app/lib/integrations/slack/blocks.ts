/**
 * Slackへ送るBlock Kitの組み立てと送信。
 *
 * 候補を出すときは「なぜ伸びていると判断したか」「使える本人の体験」
 * 「コピーリスク」まで見せて、人が判断できるようにする。
 */

import { genreLabel } from "../../note/research/sources/note";
import { ResearchItem, SocialDraft, TrendCluster, NoteArticleDraft } from "../../note/research/types";
import type { LocalAiReviewJob } from "../../note/editor/types";

export type SlackBlock = Record<string, unknown>;

/** actionIdは "維持したい情報:値" を : で連結して持つ */
export const ACTIONS = {
  makeX: "maemichi_make_x",
  makeFreeNote: "maemichi_make_free_note",
  makePaidNote: "maemichi_make_paid_note",
  makeBoth: "maemichi_make_both",
  addExperience: "maemichi_add_experience",
  regenerate: "maemichi_regenerate",
  skip: "maemichi_skip",

  bufferQueue: "maemichi_buffer_queue",
  bufferNow: "maemichi_buffer_now",
  bufferSchedule: "maemichi_buffer_schedule",
  editText: "maemichi_edit_text",
  moreConcrete: "maemichi_more_concrete",
  moreMaemichi: "maemichi_more_maemichi",
  removeLink: "maemichi_remove_link",
  noteFinalize: "maemichi_note_finalize",
  discard: "maemichi_discard",
  localEditAdopt: "maemichi_local_edit_adopt",
  localEditLight: "maemichi_local_edit_light",
  localEditRewrite: "maemichi_local_edit_rewrite",
  localEditX: "maemichi_local_edit_x",
  localEditNote: "maemichi_local_edit_note",
  localEditExperience: "maemichi_local_edit_experience",
  localEditReject: "maemichi_local_edit_reject",
} as const;

function button(text: string, actionId: string, value: string, style?: "primary" | "danger") {
  return {
    type: "button",
    text: { type: "plain_text", text, emoji: true },
    action_id: actionId,
    value,
    ...(style ? { style } : {}),
  };
}

/** 1件の候補カード */
export function candidateBlocks(
  cluster: TrendCluster,
  items: ResearchItem[],
  experienceTitles: string[]
): SlackBlock[] {
  const sources = items
    .slice(0, 3)
    .map((i) => `• <${i.sourceUrl}|${(i.title ?? i.sourceUrl).slice(0, 40)}>`)
    .join("\n");

  const why = [
    `ソース ${cluster.sourceCount}件`,
    cluster.trendScore > 0 ? `話題性 ${cluster.trendScore}/25` : "",
    `まえみち適合 ${cluster.brandFitScore}/25`,
    `体験一致 ${cluster.experienceFitScore}/20`,
    `収益導線 ${cluster.monetizationFitScore}/15`,
    `オリジナル化 ${cluster.originalityScore}/15`,
  ]
    .filter(Boolean)
    .join(" / ");

  const risk = [
    cluster.blocked ? `⚠️ ${cluster.blockReason}` : "",
    ...cluster.penalties.map((p) => `⚠️ ${p}`),
  ]
    .filter(Boolean)
    .join("\n");

  const experience =
    experienceTitles.length > 0
      ? experienceTitles.map((t) => `• ${t}`).join("\n")
      : "_登録済みの体験がありません（体験談としては書けません）_";

  const recommended = cluster.blocked
    ? "自動公開対象外"
    : cluster.experienceFitScore >= 12 && cluster.monetizationFitScore >= 8
      ? "有料note候補"
      : cluster.experienceFitScore >= 8
        ? "無料note + X"
        : "X単発（認知）";

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${cluster.totalScore}点 ${cluster.title}`.slice(0, 150), emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*テーマ*\n${cluster.summary || "—"}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*ジャンル*\n${cluster.genreIds.map(genreLabel).join("、") || "—"}` },
        { type: "mrkdwn", text: `*推奨形式*\n${recommended}` },
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `*判断の内訳*\n${why}` } },
    { type: "section", text: { type: "mrkdwn", text: `*参考にしたソース*\n${sources || "—"}` } },
    { type: "section", text: { type: "mrkdwn", text: `*使える本人の体験*\n${experience}` } },
  ];

  if (risk) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*注意*\n${risk}` } });
  }

  blocks.push({
    type: "actions",
    block_id: `cluster:${cluster.id}`,
    elements: cluster.blocked
      ? [
          button("体験を追加", ACTIONS.addExperience, cluster.id),
          button("見送る", ACTIONS.skip, cluster.id, "danger"),
        ]
      : [
          button("X投稿を作る", ACTIONS.makeX, cluster.id, "primary"),
          button("無料note", ACTIONS.makeFreeNote, cluster.id),
          button("有料note", ACTIONS.makePaidNote, cluster.id),
          button("両方作る", ACTIONS.makeBoth, cluster.id),
          button("体験を追加", ACTIONS.addExperience, cluster.id),
          button("別案", ACTIONS.regenerate, cluster.id),
          button("見送る", ACTIONS.skip, cluster.id, "danger"),
        ],
  });

  blocks.push({ type: "divider" });
  return blocks;
}

/** 生成されたnote記事の確認カード */
export function articleBlocks(article: NoteArticleDraft): SlackBlock[] {
  const summary = article.subtitle || article.freeSection.slice(0, 100).replace(/\n/g, " ");

  return [
    { type: "header", text: { type: "plain_text", text: article.title.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*説明*\n${summary}` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*種類*\n${article.articleType === "paid" ? "🔒 有料" : "🆓 無料"}` },
        {
          type: "mrkdwn",
          text: article.articleType === "paid"
            ? `*価格*\n¥${article.price ?? "未設定"}`
            : "*公開*\n全体",
        },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*タグ*\n${article.tags.join(" / ") || "—"}` },
    },
    {
      type: "actions",
      block_id: `article:${article.id}`,
      elements: [button("確認・公開", ACTIONS.noteFinalize, article.id, "primary")],
    },
    { type: "divider" },
  ];
}

/** 生成されたX投稿の確認カード */
export function draftBlocks(draft: SocialDraft): SlackBlock[] {
  const flags = [
    draft.needsDisclosure ? "[PR]あり" : "リンクなし",
    typeof draft.similarityScore === "number" ? `類似度 ${draft.similarityScore}` : "",
    draft.failureReason ? `⚠️ ${draft.failureReason}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  const canApprove = !draft.failureReason;

  return [
    { type: "section", text: { type: "mrkdwn", text: `*X投稿案*\n\`\`\`${draft.text}\`\`\`` } },
    { type: "context", elements: [{ type: "mrkdwn", text: flags }] },
    {
      type: "actions",
      block_id: `draft:${draft.id}`,
      elements: [
        ...(canApprove
          ? [
              button("Bufferへ予約", ACTIONS.bufferQueue, draft.id, "primary"),
              button("日時を指定", ACTIONS.bufferSchedule, draft.id),
            ]
          : []),
        button("もっと具体的に", ACTIONS.moreConcrete, draft.id),
        button("もっとまえみちらしく", ACTIONS.moreMaemichi, draft.id),
        ...(draft.urls.length > 0 ? [button("リンクを外す", ACTIONS.removeLink, draft.id)] : []),
        button("削除", ACTIONS.discard, draft.id, "danger"),
      ],
    },
    { type: "divider" },
  ];
}

const slackTextLimit = (text: string, max = 2600) =>
  text.length > max ? `${text.slice(0, max)}\n…（続きはNote事業部で確認）` : text;

export function localAiReviewBlocks(job: LocalAiReviewJob): SlackBlock[] {
  if (!job.result) return [];
  const result = job.result;
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Local AI添削 ${result.score.total}/25点`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*添削前*\n${slackTextLimit(job.input.originalText)}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*添削後*\n${slackTextLimit(result.revisedText)}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*主な修正点*\n${result.changes.map((item) => `• ${item}`).join("\n") || "—"}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*確認が必要な点*\n${result.questions.map((item) => `• ${item}`).join("\n") || "なし"}`,
      },
    },
    {
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `ブランド ${result.score.brandFit}/5｜有用性 ${result.score.usefulness}/5｜独自性 ${result.score.originality}/5｜読みやすさ ${result.score.readability}/5｜信頼性 ${result.score.reliability}/5`,
      }],
    },
    {
      type: "actions",
      block_id: `local-edit:${job.id}:primary`,
      elements: [
        button("採用（下書き保存）", ACTIONS.localEditAdopt, job.id, "primary"),
        button("軽く再修正", ACTIONS.localEditLight, job.id),
        button("大幅に再修正", ACTIONS.localEditRewrite, job.id),
        button("却下", ACTIONS.localEditReject, job.id, "danger"),
      ],
    },
    {
      type: "actions",
      block_id: `local-edit:${job.id}:convert`,
      elements: [
        button("X用に短縮", ACTIONS.localEditX, job.id),
        button("note記事に展開", ACTIONS.localEditNote, job.id),
        button("実体験として保存", ACTIONS.localEditExperience, job.id),
      ],
    },
  ];
}

export async function openSlackView(
  triggerId: string,
  view: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return { ok: false, error: "SLACK_BOT_TOKEN が未設定です" };
  const response = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });
  const body = (await response.json()) as { ok?: boolean; error?: string };
  return body.ok ? { ok: true } : { ok: false, error: body.error ?? "Slack APIエラー" };
}

/* ─── 送信 ───────────────────────────── */

/** Incoming Webhook があればそこへ、無ければ chat.postMessage を使う */
export async function postToSlack(
  text: string,
  blocks?: SlackBlock[],
  options?: { channel?: string; threadTs?: string }
): Promise<{ ok: boolean; error?: string }> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  try {
    if (webhook && !options?.channel && !options?.threadTs) {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, blocks }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `Slack Webhook: HTTP ${res.status}` };
    }

    const destination = options?.channel || channel;
    if (botToken && destination) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: destination,
          text,
          blocks,
          ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      return body.ok ? { ok: true } : { ok: false, error: body.error ?? "Slack APIエラー" };
    }

    return { ok: false, error: "SLACK_WEBHOOK_URL も SLACK_BOT_TOKEN も未設定です" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Slackへの送信に失敗しました" };
  }
}
