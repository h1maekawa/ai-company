import { NextRequest, NextResponse } from "next/server";
import { createPost, isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { loadBrand } from "@/app/lib/note/store";
import { prepareXDraftForPublishing } from "@/app/lib/note/safetyRepair";
import {
  affiliateCooldownOk,
  canPublishToday,
  claimOnce,
  incrementToday,
} from "@/app/lib/note/publishing/queue";
import {
  appendHistory,
  loadResearchSettings,
  loadExperiences,
  loadSocialDrafts,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

type Body = {
  draftId?: string;
  mode?: "saveToDraft" | "addToQueue" | "customScheduled";
  scheduledAt?: string;
  /** Slackのボタン二度押し対策。同じキーなら1回しか実行しない */
  idempotencyKey?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Body;
    if (!body.draftId) {
      return NextResponse.json({ error: "draftId が必要です" }, { status: 400 });
    }

    const mode = body.mode ?? "saveToDraft";
    const settings = await loadResearchSettings();
    const flags = settings.flags;

    // 1. 全体の停止スイッチ
    if (!flags.publishingEnabled) {
      return NextResponse.json(
        { error: "投稿が停止中です（設定の publishingEnabled をONにしてください）" },
        { status: 423 }
      );
    }

    // 2. 予約・投稿は xAutoPublish がONのときだけ。下書き保存は常に許可
    if (mode !== "saveToDraft" && !flags.xAutoPublish) {
      return NextResponse.json(
        { error: "X自動投稿がOFFです。下書き保存のみ可能です" },
        { status: 423 }
      );
    }

    const [drafts, brandFile, experiences] = await Promise.all([
      loadSocialDrafts(),
      loadBrand(),
      loadExperiences(),
    ]);
    const draft = drafts.find((d) => d.id === body.draftId);
    if (!draft) {
      return NextResponse.json({ error: "その下書きが見つかりません" }, { status: 404 });
    }

    // 3. idempotency keyを消費する前にも同じSafety Policyでfail-closeする。
    const prepared = await prepareXDraftForPublishing({
      draft,
      brand: brandFile.brand,
      experiences,
    });
    if (!prepared.safe) {
      return NextResponse.json(
        { error: prepared.reasons.join(" / "), hint: "下書きは保持しています", kind: "validation" },
        { status: 422 }
      );
    }

    if (!isBufferConfigured()) {
      return NextResponse.json(
        { error: "Bufferの環境変数が未設定です（BUFFER_API_KEY / BUFFER_ORGANIZATION_ID / BUFFER_X_CHANNEL_ID）" },
        { status: 422 }
      );
    }

    // 4. 二重投稿防止
    const key = body.idempotencyKey ?? `buffer:${draft.id}:${mode}:${body.scheduledAt ?? ""}`;
    if (!(await claimOnce(key))) {
      return NextResponse.json({
        ok: true,
        deduped: true,
        message: "同じ操作が既に実行済みのため、何もしませんでした",
      });
    }

    // 5. 1日の投稿上限
    if (mode !== "saveToDraft") {
      const limit = await canPublishToday("x", flags.maxXPostsPerDay);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: `本日のX投稿上限（${flags.maxXPostsPerDay}件）に達しています` },
          { status: 429 }
        );
      }
    }

    // 6. アフィリエイト連投防止
    if (draft.affiliateId) {
      const recent = drafts
        .filter((d) => d.status === "scheduled" || d.status === "published")
        .map((d) => d.affiliateId);
      if (!affiliateCooldownOk(draft.affiliateId, recent, flags.affiliateCooldownPosts)) {
        return NextResponse.json(
          { error: "同じアフィリエイトが直近で使われています。間隔を空けてください" },
          { status: 429 }
        );
      }
    }

    const result = await createPost({
      draft: prepared.draft,
      safetyContext: { brand: brandFile.brand, experiences },
      mode,
      scheduledAt: body.scheduledAt,
      maxScheduled: flags.maxBufferScheduled,
    });

    if (!result.ok) {
      // Validation/Buffer失敗時は本文だけでなく既存status・failureReasonも変更しない。
      return NextResponse.json(
        { error: result.error.message, hint: result.error.hint, kind: result.error.kind },
        { status: result.error.kind === "validation" ? 422 : result.error.kind === "rate-limit" || result.error.kind === "slot-limit" ? 429 : 502 }
      );
    }

    const now = new Date().toISOString();
    await saveSocialDrafts(
      drafts.map((d) =>
        d.id === draft.id
          ? {
              ...d,
              text: result.data.draft.text,
              status: mode === "saveToDraft" ? "queued" : "scheduled",
              bufferPostId: result.data.id,
              scheduledAt: result.data.dueAt ?? body.scheduledAt,
              failureReason: undefined,
              updatedAt: now,
            }
          : d
      )
    );

    if (mode !== "saveToDraft") await incrementToday("x");

    await appendHistory({
      id: `h${Date.now().toString(36)}`,
      platform: "x",
      contentId: draft.id,
      action: mode === "saveToDraft" ? "Bufferへ下書き保存" : "Bufferへ予約",
      at: now,
      detail: result.data.dueAt ? `予定 ${result.data.dueAt}` : undefined,
    });

    return NextResponse.json({
      ok: true,
      post: result.data,
      repaired: prepared.repaired || result.data.repaired,
      message: prepared.repaired || result.data.repaired
        ? "未確認の体験表現を安全な表現へ修正してBufferへ送信しました"
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bufferへの送信に失敗しました";
    console.error("[api/note/publishing/buffer] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
