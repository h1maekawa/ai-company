import { NextRequest, NextResponse } from "next/server";
import {
  isOwnedXPost,
  isXReferenceNote,
  loadXWorkspace,
  saveXWorkspace,
} from "@/app/lib/note/x/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadXWorkspace());
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { ownedPosts?: unknown[]; referenceNotes?: unknown[] };
    if (!(body.ownedPosts ?? []).every(isOwnedXPost) || !(body.referenceNotes ?? []).every(isXReferenceNote)) {
      return NextResponse.json({ error: "保存内容が不正です" }, { status: 400 });
    }
    return NextResponse.json(await saveXWorkspace({
      ownedPosts: (body.ownedPosts ?? []) as never[],
      referenceNotes: (body.referenceNotes ?? []) as never[],
    }));
  } catch {
    return NextResponse.json({ error: "Xワークスペースを保存できませんでした" }, { status: 500 });
  }
}
