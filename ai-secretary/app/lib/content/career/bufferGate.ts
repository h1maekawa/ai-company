import { CAREER_DIVISION_ID, type CareerPost, type CareerState } from "./types";
import { CAREER_BRAND } from "./brand";
import { careerHash, careerId } from "./ids";

export type BufferDryRunItem = {
  postId: string;
  platform: "x" | "instagram";
  scheduledAt: string;
  title: string;
  status: "eligible" | "blocked" | "excluded";
  blockReasons: string[];
  payloadPreview: {
    channel: string;
    text: string;
    mediaCount: number;
    estimatedCharacters: number;
  };
};

export type BufferDryRunReport = {
  divisionId: typeof CAREER_DIVISION_ID;
  timestamp: string;
  channelVerification: {
    x: { status: string; channelId: string | null };
    instagram: { status: string; channelId: string | null };
  };
  totalPostsChecked: number;
  eligibleCount: number;
  blockedCount: number;
  excludedCount: number;
  duplicateHashCount: number;
  realPublishBlocked: true;
  items: BufferDryRunItem[];
  summaryMessage: string;
};

/**
 * Buffer dry-run検証。実送信は100%遮断し、安全検証結果のみをレポートする。
 */
export function dryRunCareerBuffer(
  state: CareerState,
  options?: {
    mockVerifiedChannels?: boolean; // テスト用フラグ
    now?: Date;
  }
): BufferDryRunReport {
  const at = (options?.now ?? new Date()).toISOString();
  const brand = CAREER_BRAND;

  const channelVerification = {
    x: {
      status: options?.mockVerifiedChannels ? "CONFIRMED" : brand.social.x.channelStatus,
      channelId: options?.mockVerifiedChannels ? "mock-x-channel-123" : brand.social.x.bufferChannelId,
    },
    instagram: {
      status: options?.mockVerifiedChannels ? "CONFIRMED" : brand.social.instagram.channelStatus,
      channelId: options?.mockVerifiedChannels ? "mock-ig-channel-456" : brand.social.instagram.bufferChannelId,
    },
  };

  const seenHashes = new Set<string>();
  let duplicateHashCount = 0;
  const items: BufferDryRunItem[] = [];

  for (const post of state.posts.filter((p) => p.divisionId === CAREER_DIVISION_ID)) {
    const reasons: string[] = [];
    const channelInfo = channelVerification[post.platform];

    // 1. チャンネル検証
    if (channelInfo.status !== "CONFIRMED" || !channelInfo.channelId) {
      reasons.push(`BUFFER_CHANNEL_UNCONFIRMED: ${post.platform.toUpperCase()}のBuffer channel IDが未設定または未確認です`);
    }

    // 2. 人間承認ゲート
    if (post.status !== "approved") {
      reasons.push(`POST_NOT_APPROVED: 現在のステータスは「${post.status}」です。事前の人間承認が必須です`);
    }

    // 3. 匿名性・事実性リスク
    if (post.anonymityCheck !== "clear") {
      reasons.push(`ANONYMITY_RISK: 個人情報または特定リスクが検出されています (${post.anonymityCheck})`);
    }
    if (post.factualityCheck !== "clear") {
      reasons.push(`FACTUALITY_RISK: 内定保証または根拠なき断定表現が検出されています (${post.factualityCheck})`);
    }

    // 4. 重複検知
    if (seenHashes.has(post.contentHash)) {
      reasons.push("DUPLICATE_CONTENT_HASH: 同一内容の投稿が既に存在します");
      duplicateHashCount++;
    } else {
      seenHashes.add(post.contentHash);
    }

    // 5. プラットフォーム固有仕様チェック
    if (post.platform === "x") {
      if (post.body.length > 280) {
        reasons.push(`X_CHARACTER_LIMIT_EXCEEDED: 本文が280字を超えています (${post.body.length}字)`);
      }
      if (!post.body.trim()) {
        reasons.push("X_BODY_EMPTY: 本文が空です");
      }
    } else if (post.platform === "instagram") {
      if (post.slides.length !== 5) {
        reasons.push(`IG_CAROUSEL_SLIDE_COUNT: カルーセルは5枚固定である必要があります (現在: ${post.slides.length}枚)`);
      }
      if (post.caption.length > 2200) {
        reasons.push(`IG_CAPTION_LIMIT_EXCEEDED: キャプションが2200字を超えています (${post.caption.length}字)`);
      }
    }

    const isExcluded = post.status !== "approved";
    const isBlocked = reasons.length > 0;
    const finalStatus: "eligible" | "blocked" | "excluded" = isExcluded
      ? "excluded"
      : isBlocked
      ? "blocked"
      : "eligible";

    items.push({
      postId: post.id,
      platform: post.platform,
      scheduledAt: post.scheduledAt,
      title: post.title,
      status: finalStatus,
      blockReasons: reasons,
      payloadPreview: {
        channel: channelInfo.channelId ?? "UNCONFIGURED",
        text: post.platform === "x" ? post.body : post.caption,
        mediaCount: post.platform === "instagram" ? post.slides.length : 0,
        estimatedCharacters: post.platform === "x" ? post.body.length : post.caption.length,
      },
    });
  }

  const eligibleCount = items.filter((i) => i.status === "eligible").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const excludedCount = items.filter((i) => i.status === "excluded").length;

  let summaryMessage = "";
  if (!options?.mockVerifiedChannels && (channelVerification.x.status !== "CONFIRMED" || channelVerification.instagram.status !== "CONFIRMED")) {
    summaryMessage = "安全停止中: Buffer接続先が「未確認」です。本番投稿・予約はブロックされています。";
  } else if (eligibleCount === 0) {
    summaryMessage = `配信適格な投稿はありません (未承認: ${excludedCount}件, ブロック: ${blockedCount}件)。`;
  } else {
    summaryMessage = `検証完了: ${eligibleCount}件が送信適格（本番送信は安全無効化されています）。`;
  }

  return {
    divisionId: CAREER_DIVISION_ID,
    timestamp: at,
    channelVerification,
    totalPostsChecked: items.length,
    eligibleCount,
    blockedCount,
    excludedCount,
    duplicateHashCount,
    realPublishBlocked: true,
    items,
    summaryMessage,
  };
}
