import { NextResponse } from "next/server";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";

export const dynamic = "force-dynamic";

/** GET /api/company/organization — 組織の現在形（v3.1 §5 / §27） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(buildOrganizationSnapshot());
  } catch (error) {
    console.error("[api/company/organization] 失敗:", error);
    return NextResponse.json({ error: "組織情報の取得に失敗しました" }, { status: 500 });
  }
}
