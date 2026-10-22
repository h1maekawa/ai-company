import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState } from "@/app/lib/content/career/store";
import { getExistingSlideImages, renderCareerPostImages } from "@/app/lib/content/career/imageRenderer";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await careerRequestAllowed(request))) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const images = getExistingSlideImages(id);
    return NextResponse.json({ postId: id, images, count: images.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GET_IMAGES_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const state = loadCareerState();
    const post = state.posts.find((p) => p.id === id && p.divisionId === "career");
    if (!post) {
      return NextResponse.json({ error: "POST_NOT_FOUND" }, { status: 404 });
    }

    const result = await renderCareerPostImages(post);
    if (!result.success) {
      return NextResponse.json({ error: result.error, result }, { status: 422 });
    }

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "RENDER_IMAGES_FAILED" }, { status: 500 });
  }
}
