import { NextResponse } from "next/server";
import { generateMorningReport } from "@/app/lib/report/morning";

export async function GET() {
  try {
    const report = await generateMorningReport();
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error("[Morning API] Error generating report:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
