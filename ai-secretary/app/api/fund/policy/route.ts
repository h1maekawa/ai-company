import { NextRequest, NextResponse } from "next/server";
import { loadPolicy, savePolicy } from "@/app/lib/fund/store";
import { validatePolicy } from "@/app/lib/fund/policy";

/**
 * GET /api/fund/policy — 現在のポリシー設定（バージョン付き）を返す
 * PUT /api/fund/policy — ポリシーを更新する（policyVersionの引き上げ必須）
 * 認証はmiddleware（セッションCookie）で担保。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { policy, source } = await loadPolicy();
    return NextResponse.json({ success: true, source, policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const next = body?.policy;

    if (!validatePolicy(next)) {
      return NextResponse.json(
        { error: "ポリシーのスキーマが不正です。必須の数値閾値が欠けています" },
        { status: 400 }
      );
    }

    const { policy: current, source } = await loadPolicy();
    if (source === "vault" && next.policyVersion <= current.policyVersion) {
      return NextResponse.json(
        {
          error: `policyVersion は現在の ${current.policyVersion} より大きい値にしてください`,
        },
        { status: 409 }
      );
    }

    next.updatedAt = new Date().toISOString().slice(0, 10);
    await savePolicy(next);
    return NextResponse.json({ success: true, policyVersion: next.policyVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
