import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";

export const runtime = "nodejs";

const OUTPUT_DIR = path.resolve(process.cwd(), "memory/personal/career/images");

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; slide: string }> }
) {
  if (!(await careerRequestAllowed(request))) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const { id, slide } = await context.params;
    const pos = parseInt(slide, 10);
    if (isNaN(pos) || pos < 1 || pos > 5) {
      return NextResponse.json({ error: "INVALID_SLIDE_NUMBER" }, { status: 400 });
    }

    const filePath = path.join(OUTPUT_DIR, id, `slide-${pos}.png`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "IMAGE_NOT_FOUND" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GET_IMAGE_FAILED" }, { status: 500 });
  }
}
