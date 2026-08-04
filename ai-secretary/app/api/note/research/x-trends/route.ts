import { NextRequest, NextResponse } from "next/server";
import { fetchXTrends, type XTrendLocation } from "@/app/lib/note/research/x-trends";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const value = request.nextUrl.searchParams.get("location");
  const location: XTrendLocation = value === "tokyo" ? "tokyo" : "japan";
  return NextResponse.json(await fetchXTrends(location));
}
