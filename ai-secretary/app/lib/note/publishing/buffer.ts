/**
 * Buffer連携（GraphQL API）。
 *
 * 予約枠の上限を守り、エラー時にも本文を失わないことを最優先にする。
 * 投稿に失敗しても下書き（SocialDraft.text）は残す。
 */

const BUFFER_ENDPOINT = "https://graph.buffer.com/";

export type BufferMode = "saveToDraft" | "addToQueue" | "customScheduled";

export type BufferError = {
  kind: "auth" | "rate-limit" | "mutation" | "channel" | "config" | "network" | "slot-limit";
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

  const result = await graphql<{ account?: { channels?: BufferChannel[] } }>(
    `query Channels($organizationId: String!) {
      account {
        channels(input: { organizationId: $organizationId }) {
          id
          service
          name
        }
      }
    }`,
    { organizationId: cfg.org }
  );

  if (!result.ok) return result;
  return { ok: true, data: result.data.account?.channels ?? [] };
}

/* ─── 予約中の件数 ───────────────────────── */

type BufferPostNode = { id: string; status?: string; dueAt?: string; text?: string };

/** 現在予約中（未投稿）の件数を数える。無料プランの枠を超えないため */
export async function countScheduled(): Promise<BufferResult<number>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: { kind: "config", message: "Bufferの環境変数が未設定です" } };

  const result = await graphql<{ posts?: { edges?: { node: BufferPostNode }[] } }>(
    `query Posts($organizationId: String!, $channelIds: [String!]) {
      posts(input: { organizationId: $organizationId, channelIds: $channelIds, status: pending }) {
        edges { node { id status dueAt } }
      }
    }`,
    { organizationId: cfg.org, channelIds: [cfg.channel] }
  );

  if (!result.ok) return result;
  return { ok: true, data: result.data.posts?.edges?.length ?? 0 };
}

/* ─── 投稿の作成 ───────────────────────── */

export type CreatePostInput = {
  text: string;
  mode: BufferMode;
  /** customScheduled のときだけ使う（ISO文字列） */
  scheduledAt?: string;
  /** 予約枠の上限。超える場合は投稿せずエラーを返す */
  maxScheduled?: number;
};

export type CreatedPost = { id: string; status?: string; dueAt?: string };

export async function createPost(
  input: CreatePostInput
): Promise<BufferResult<CreatedPost>> {
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

  const result = await graphql<{ createPost?: { id?: string; status?: string; dueAt?: string } }>(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        id
        status
        dueAt
      }
    }`,
    {
      input: {
        organizationId: cfg.org,
        channelIds: [cfg.channel],
        text: input.text,
        mode: input.mode,
        ...(input.mode === "customScheduled" && input.scheduledAt
          ? { dueAt: input.scheduledAt }
          : {}),
      },
    }
  );

  if (!result.ok) return result;
  const post = result.data.createPost;
  if (!post?.id) {
    return { ok: false, error: { kind: "mutation", message: "Bufferが投稿IDを返しませんでした" } };
  }
  return { ok: true, data: { id: post.id, status: post.status, dueAt: post.dueAt } };
}

export async function deletePost(postId: string): Promise<BufferResult<boolean>> {
  const result = await graphql<{ deletePost?: { id?: string } }>(
    `mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) { id }
    }`,
    { input: { id: postId } }
  );
  if (!result.ok) return result;
  return { ok: true, data: true };
}

export async function getPost(postId: string): Promise<BufferResult<BufferPostNode | null>> {
  const result = await graphql<{ post?: BufferPostNode }>(
    `query Post($id: String!) {
      post(input: { id: $id }) { id status dueAt text }
    }`,
    { id: postId }
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.post ?? null };
}
