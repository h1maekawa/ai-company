import { NextRequest, NextResponse } from "next/server";
import { loadBrand } from "@/app/lib/note/store";
import { accountForGenre, DEFAULT_GENRES, type DailyPostSeed } from "@/app/lib/note/types";
import { generateXPosts } from "@/app/lib/note/research/generate";
import { loadSocialDrafts, saveSocialDrafts } from "@/app/lib/note/research/store";
import type { GrowthGoal, OutputType, TrendCluster, XPostLength } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  seed?: DailyPostSeed;
  growthGoal?: GrowthGoal;
  outputType?: OutputType;
  xLength?: XPostLength;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.seed?.whatHappened?.trim()) {
    return NextResponse.json({ error: "「今日あったこと」を入力してください" }, { status: 400 });
  }
  const [brandFile, existingDrafts] = await Promise.all([loadBrand(), loadSocialDrafts()]);
  const genreId = body.seed.genreId || "daily-thoughts";
  const genre = DEFAULT_GENRES.find((item) => item.id === genreId) ?? DEFAULT_GENRES[0];
  const account = accountForGenre(brandFile.xAccounts, genre.id) ?? brandFile.xAccounts[0];
  if (!account) return NextResponse.json({ error: "Xアカウントが登録されていません" }, { status: 422 });

  const now = new Date().toISOString();
  const cluster: TrendCluster = {
    id: `daily-${Date.now()}`,
    title: body.seed.whatHappened.slice(0, 80),
    summary: [body.seed.feeling, body.seed.thought, body.seed.uncertainty].filter(Boolean).join(" / "),
    genreIds: [genre.id],
    researchItemIds: [],
    sourceCount: 0,
    firstDetectedAt: now,
    lastDetectedAt: now,
    trendScore: 0,
    brandFitScore: 25,
    experienceFitScore: 20,
    monetizationFitScore: 0,
    originalityScore: 15,
    totalScore: 60,
    penalties: [],
    blocked: false,
    matchedExperienceIds: [],
    status: "selected",
  };
  const result = await generateXPosts({
    cluster,
    items: [],
    experiences: [],
    brand: brandFile.brand,
    genre,
    account,
    purpose: body.growthGoal === "trust" ? "trust" : "reach",
    pastPosts: existingDrafts.map((draft) => ({ label: `過去投稿(${draft.id})`, text: draft.text })),
    outputType: body.outputType ?? "x-post",
    length: body.xLength ?? "short",
    sourceContext: { type: "daily", seed: { ...body.seed, genreId } },
  });
  await saveSocialDrafts([...result.drafts, ...existingDrafts]);
  return NextResponse.json({ xDrafts: result.drafts, warning: result.warning });
}
