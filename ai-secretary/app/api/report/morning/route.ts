import { NextRequest, NextResponse } from "next/server";
import { generateMorningReport } from "@/app/lib/report/morning";
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

export async function GET(req: NextRequest) {
  const authError = verifyApiSecret(req);
  if (authError) return authError;

  try {
    const report = await generateMorningReport();
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error("[Morning API] Error generating report:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
