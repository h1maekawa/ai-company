import { NextRequest, NextResponse } from "next/server";
import { deleteMediaAsset, loadContentCore, upsertMediaAsset } from "@/app/lib/content/core/store";
import type { MediaAsset } from "@/app/lib/content/core/types";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const core = await loadContentCore();
  return NextResponse.json({ mediaAssets: core.mediaAssets });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    const body = await req.json();
    const now = new Date().toISOString();
    const asset: MediaAsset = {
      id: String(body.id || `asset_${Date.now().toString(36)}`),
      type: body.type || "other",
      source: body.source || "user",
      productIds: Array.isArray(body.productIds) ? body.productIds : [],
      usageRights: body.usageRights || "unknown",
      storageRef: String(body.storageRef || ""),
      realProductRepresentation: body.realProductRepresentation === true,
      width: body.width,
      height: body.height,
      durationSec: body.durationSec,
      createdAt: now,
      updatedAt: now,
    };
    return NextResponse.json({ mediaAsset: await upsertMediaAsset(asset) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_ASSET" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    const body = await req.json();
    const core = await loadContentCore();
    const current = core.mediaAssets.find((item) => item.id === body.id);
    if (!current) return NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
    const asset: MediaAsset = { ...current, ...body, id: current.id, createdAt: current.createdAt };
    return NextResponse.json({ mediaAsset: await upsertMediaAsset(asset) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_ASSET" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const deleted = await deleteMediaAsset(id);
  return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "ASSET_NOT_FOUND" }, { status: 404 });
}
