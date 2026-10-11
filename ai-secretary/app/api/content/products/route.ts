import { NextRequest, NextResponse } from "next/server";
import { deleteProduct, loadContentCore, upsertProduct } from "@/app/lib/content/core/store";
import type { PersonalProduct } from "@/app/lib/content/core/types";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const core = await loadContentCore();
  return NextResponse.json({ products: core.products });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    const body = await req.json();
    const now = new Date().toISOString();
    const product: PersonalProduct = {
      id: String(body.id || `product_${Date.now().toString(36)}`),
      brand: String(body.brand || "").trim(),
      name: String(body.name || "").trim(),
      category: String(body.category || "").trim(),
      ownership: body.ownership || "considering",
      purchasedAt: body.purchasedAt || undefined,
      purchaseSource: body.purchaseSource || undefined,
      personalExperience: body.personalExperience
        ? { ...body.personalExperience, confirmedByUser: false, confirmedAt: undefined }
        : undefined,
      assetIds: Array.isArray(body.assetIds) ? body.assetIds : [],
      officialSourceRefs: Array.isArray(body.officialSourceRefs) ? body.officialSourceRefs : [],
      offerIds: Array.isArray(body.offerIds) ? body.offerIds : [],
      createdAt: now,
      updatedAt: now,
    };
    return NextResponse.json({ product: await upsertProduct(product) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_PRODUCT" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    const body = await req.json();
    const core = await loadContentCore();
    const current = core.products.find((item) => item.id === body.id);
    if (!current) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
    const confirm = body.action === "confirm-personal-experience";
    if (confirm && body.confirmedByHuman !== true) {
      return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
    }
    const personalExperience = body.personalExperience
      ? {
          ...body.personalExperience,
          confirmedByUser: confirm,
          confirmedAt: confirm ? new Date().toISOString() : undefined,
        }
      : current.personalExperience;
    const product: PersonalProduct = {
      ...current,
      ...body,
      id: current.id,
      createdAt: current.createdAt,
      personalExperience,
      assetIds: Array.isArray(body.assetIds) ? body.assetIds : current.assetIds,
      officialSourceRefs: Array.isArray(body.officialSourceRefs) ? body.officialSourceRefs : current.officialSourceRefs,
      offerIds: Array.isArray(body.offerIds) ? body.offerIds : current.offerIds,
    };
    delete (product as PersonalProduct & { action?: string }).action;
    delete (product as PersonalProduct & { confirmedByHuman?: boolean }).confirmedByHuman;
    return NextResponse.json({ product: await upsertProduct(product) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "INVALID_PRODUCT" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    const id = req.nextUrl.searchParams.get("id") || "";
    const deleted = await deleteProduct(id);
    return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DELETE_FAILED" }, { status: 409 });
  }
}
