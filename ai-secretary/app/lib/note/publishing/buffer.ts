/**
 * Buffer連携（GraphQL API）。
 *
 * 予約枠の上限を守り、エラー時にも本文を失わないことを最優先にする。
 * 投稿に失敗しても下書き（SocialDraft.text）は残す。
 */

import type { Brand } from "../types";
import { prepareXDraftForPublishing } from "../safetyRepair";
import type { ExperienceEntry, SocialDraft } from "../research/types";

const BUFFER_ENDPOINT = "https://api.buffer.com";

export type BufferMode = "saveToDraft" | "addToQueue" | "customScheduled";

export type BufferError = {
  kind: "auth" | "rate-limit" | "mutation" | "channel" | "config" | "network" | "slot-limit" | "validation";
  message: string;
  /** 人が次に何をすればよいか */
  hint?: string;
};

export type BufferResult<T> = { ok: true; data: T } | { ok: false; error: BufferError };

function config(): { key: string; org: string; channel: string } | null {
  const key = process.env.BUFFER_API_KEY;
  const org = process.env.BUFFER_ORGANIZATION_ID;
  const channel = process.env.BUFFER_X_CHANNEL_ID;
  if (!key || !org || !channel) return null;
  return { key, org, channel };
}

export function isBufferConfigured(): boolean {
  if (process.env.BUFFER_ENABLED !== "true") return false;
  return config() !== null;
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message?: string; extensions?: { code?: string } }[];
};

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<BufferResult<T>> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      error: {
        kind: "config",
        message: "Bufferの環境変数が未設定です",
        hint: "BUFFER_API_KEY / BUFFER_ORGANIZATION_ID / BUFFER_X_CHANNEL_ID を設定してください",
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(BUFFER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: error instanceof Error ? error.message : "Bufferへ接続できませんでした",
        hint: "下書きは保持しています。時間をおいて再試行してください",
      },
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: {
        kind: "auth",
        message: "Bufferの認証に失敗しました（401）",
        hint: "BUFFER_API_KEY を確認してください",
      },
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: {
        kind: "rate-limit",
        message: "Bufferの利用上限に達しました（429）",
        hint: "下書きは保持しています。しばらく待って再試行してください",
      },
    };
  }

  let body: GraphQLResponse<T>;
  try {
    body = (await res.json()) as GraphQLResponse<T>;
  } catch {
    return { ok: false, error: { kind: "network", message: "Bufferの応答を解析できませんでした" } };
  }

  if (body.errors?.length) {
    const message = body.errors[0].message ?? "Bufferがエラーを返しました";
    const isChannel = /channel|connect/i.test(message);
    return {
      ok: false,
      error: {
        kind: isChannel ? "channel" : "mutation",
        message,
        hint: isChannel
          ? "BufferでXチャンネルが接続されているか確認してください"
          : "下書きは保持しています",
      },
    };
  }

  if (!body.data) {
    return { ok: false, error: { kind: "mutation", message: "Bufferが空の応答を返しました" } };
  }
  return { ok: true, data: body.data };
}

/* ─── チャンネル ───────────────────────────── */

export type BufferChannel = { id: string; service: string; name: string };

export async function getChannels(): Promise<BufferResult<BufferChannel[]>> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      error: { kind: "config", message: "Bufferの環境変数が未設定です" },
    };
  }

  const result = await graphql<{ channels?: BufferChannel[] }>(
    `query Channels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        service
        name
      }
    }`,
    { organizationId: cfg.org }
  );

  if (result.ok === false) return result;
  return { ok: true, data: result.data.channels ?? [] };
}

/* ─── 予約中の件数 ───────────────────────── */

export type BufferPostMetric = {
  type?: string;
  name?: string;
  value?: number;
  unit?: "count" | "percentage" | string;
};

export type BufferPostNode = {
  id: string;
  status?: string;
  text?: string;
  dueAt?: string;
  sentAt?: string;
  externalLink?: string;
  metrics?: BufferPostMetric[] | null;
  metricsUpdatedAt?: string | null;
};

/** 現在予約中（未投稿）の件数を数える。無料プランの枠を超えないため */
export async function countScheduled(): Promise<BufferResult<number>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: { kind: "config", message: "Bufferの環境変数が未設定です" } };

  const result = await graphql<{ posts?: { edges?: { node: BufferPostNode }[] } }>(
    `query Posts($organizationId: OrganizationId!, $channelIds: [ChannelId!]) {
      posts(
        first: 100
        input: {
          organizationId: $organizationId
          filter: { channelIds: $channelIds, status: [scheduled] }
        }
      ) {
        edges { node { id status dueAt } }
      }
    }`,
    { organizationId: cfg.org, channelIds: [cfg.channel] }
  );

  if (result.ok === false) return result;
  return { ok: true, data: result.data.posts?.edges?.length ?? 0 };
}

/* ─── 投稿の作成 ───────────────────────── */

export type CreatePostInput = {
  draft: SocialDraft;
  safetyContext: { brand: Brand; experiences: ExperienceEntry[] };
  mode: BufferMode;
  /** customScheduled のときだけ使う（ISO文字列） */
  scheduledAt?: string;
  /** 予約枠の上限。超える場合は投稿せずエラーを返す */
  maxScheduled?: number;
  /** テスト・限定実行用。通常は共通AI Safety Repairを使う。 */
  repair?: (text: string) => Promise<string>;
};

export type CreatedPost = {
  id: string;
  status?: string;
  dueAt?: string;
  draft: SocialDraft;
  repaired: boolean;
};

export async function createPost(
  input: CreatePostInput
): Promise<BufferResult<CreatedPost>> {
  // Bufferへの全X送信経路が必ず通る最終境界。古いfailureReasonの有無にかかわらず再評価する。
  const prepared = await prepareXDraftForPublishing({
    draft: input.draft,
    ...input.safetyContext,
    repair: input.repair,
  });
  if (!prepared.safe) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: prepared.reasons.join(" / "),
        hint: "下書きは保持しています",
      },
    };
  }

  const cfg = config();
  if (!cfg) return { ok: false, error: { kind: "config", message: "Bufferの環境変数が未設定です" } };

  // 予約系のときだけ枠を確認する（下書き保存は枠を消費しない）
  if (input.mode !== "saveToDraft" && typeof input.maxScheduled === "number") {
    const count = await countScheduled();
    if (count.ok && count.data >= input.maxScheduled) {
      return {
        ok: false,
        error: {
          kind: "slot-limit",
          message: `Bufferの予約が上限（${input.maxScheduled}件）に達しています`,
          hint: "下書きは保持しています。既存の予約を消化してから再試行してください",
        },
      };
    }
  }

  const result = await graphql<{
    createPost?: {
      post?: { id?: string; status?: string; dueAt?: string };
      message?: string;
    };
  }>(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id status dueAt }
        }
        ... on MutationError {
          message
        }
      }
    }`,
    {
      input: {
        channelId: cfg.channel,
        text: prepared.draft.text,
        schedulingType: "automatic",
        mode: input.mode === "saveToDraft" ? "addToQueue" : input.mode,
        saveToDraft: input.mode === "saveToDraft",
        aiAssisted: true,
        ...(input.mode === "customScheduled" && input.scheduledAt
          ? { dueAt: input.scheduledAt }
          : {}),
      },
    }
  );

  if (result.ok === false) return result;
  if (result.data.createPost?.message) {
    return {
      ok: false,
      error: { kind: "mutation", message: result.data.createPost.message, hint: "下書きは保持しています" },
    };
  }
  const post = result.data.createPost?.post;
  if (!post?.id) {
    return { ok: false, error: { kind: "mutation", message: "Bufferが投稿IDを返しませんでした" } };
  }
  return {
    ok: true,
    data: {
      id: post.id,
      status: post.status,
      dueAt: post.dueAt,
      draft: prepared.draft,
      repaired: prepared.repaired,
    },
  };
}

export async function deletePost(postId: string): Promise<BufferResult<boolean>> {
  const result = await graphql<{ deletePost?: { id?: string } }>(
    `mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) { id }
    }`,
    { input: { id: postId } }
  );
  if (result.ok === false) return result;
  return { ok: true, data: true };
}

export async function getPost(postId: string): Promise<BufferResult<BufferPostNode | null>> {
  const result = await graphql<{ post?: BufferPostNode }>(
    `query Post($id: String!) {
      post(input: { id: $id }) {
        id
        status
        text
        dueAt
        sentAt
        externalLink
        metrics { type name value unit }
        metricsUpdatedAt
      }
    }`,
    { id: postId }
  );
  if (result.ok === false) return result;
  return { ok: true, data: result.data.post ?? null };
}
