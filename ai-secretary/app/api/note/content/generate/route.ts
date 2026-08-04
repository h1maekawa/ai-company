import { NextRequest, NextResponse } from "next/server";
import { loadAffiliates, loadBrand, loadIdeas } from "@/app/lib/note/store";
import { generateNoteArticle, generateXPosts } from "@/app/lib/note/research/generate";
import { usableExperiences } from "@/app/lib/note/research/experience";
import {
  loadClusters,
  loadExperiences,
  loadNoteQueue,
  loadPerformance,
  loadResearchInbox,
  loadSocialDrafts,
  saveClusters,
  saveNoteQueue,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";
import {
  defaultAffiliatePolicy,
  ContentPurpose,
  GrowthGoal,
  OutputType,
} from "@/app/lib/note/research/types";
import { accountForGenre, DEFAULT_GENRES } from "@/app/lib/note/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  clusterId?: string;
  kind?: "x" | "note" | "both";
  purpose?: ContentPurpose;
  articleType?: "free" | "paid" | "affiliate";
  affiliateId?: string;
  /** 未確認の体験でも使う（Slackで「一般的な考察として書く」を選んだ場合など） */
  allowUnverified?: boolean;
  personalAngle?: string;
  growthGoal?: GrowthGoal;
  outputType?: OutputType;
};

function purposeForGoal(goal?: GrowthGoal): ContentPurpose {
  if (goal === "note-bridge") return "note-bridge";
  if (goal === "trust" || goal === "save") return "trust";
  if (goal === "monetization") return "x-monetization";
  return "reach";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Body;
    if (!body.clusterId) {
      return NextResponse.json({ error: "clusterId が必要です" }, { status: 400 });
    }

    const [clusters, items, experiences, brandFile, affiliates, ideaFile, drafts, perf] =
      await Promise.all([
        loadClusters(),
        loadResearchInbox(),
        loadExperiences(),
        loadBrand(),
        loadAffiliates(),
        loadIdeas(),
        loadSocialDrafts(),
        loadPerformance(),
      ]);

    const cluster = clusters.find((c) => c.id === body.clusterId);
    if (!cluster) {
      return NextResponse.json({ error: "その候補が見つかりません" }, { status: 404 });
    }
    if (cluster.blocked) {
      return NextResponse.json(
        { error: `このテーマは自動生成の対象外です: ${cluster.blockReason}` },
        { status: 422 }
      );
    }

    const clusterItems = items.filter((i) => cluster.researchItemIds.includes(i.id));
    const genreId = cluster.genreIds[0] ?? DEFAULT_GENRES[0].id;
    const genre =
      ideaFile.genres.find((g) => g.id === genreId) ??
      DEFAULT_GENRES.find((g) => g.id === genreId) ??
      DEFAULT_GENRES[0];

    const selected = usableExperiences(
      experiences,
      cluster.matchedExperienceIds,
      body.allowUnverified ?? false
    );

    const affiliate = body.affiliateId
      ? affiliates.find((a) => a.id === body.affiliateId && a.active && a.url)
      : undefined;
    const policy = affiliate
      ? perf.policies.find((p) => p.affiliateId === affiliate.id) ??
        defaultAffiliatePolicy(affiliate.id)
      : undefined;

    // 類似チェック用に自分の過去投稿を渡す
    const pastPosts = drafts.map((d) => ({ label: `過去投稿(${d.id})`, text: d.text }));

    const kind = body.kind ?? "x";
    const response: Record<string, unknown> = { clusterId: cluster.id };

    if (kind === "x" || kind === "both") {
      const account = accountForGenre(brandFile.xAccounts, genre.id) ?? brandFile.xAccounts[0];
      if (!account) {
        return NextResponse.json({ error: "Xアカウントが登録されていません" }, { status: 422 });
      }

      const result = await generateXPosts({
        cluster,
        items: clusterItems,
        experiences: selected,
        brand: brandFile.brand,
        genre,
        account,
        purpose: body.purpose ?? purposeForGoal(body.growthGoal),
        affiliate,
        policy,
        pastPosts,
        authorViewpoint: body.personalAngle?.trim() || undefined,
      });

      if (result.drafts.length > 0) {
        await saveSocialDrafts([...result.drafts, ...drafts]);
      }
      response.xDrafts = result.drafts;
      response.xWarning = result.warning;
    }

    if (kind === "note" || kind === "both") {
      const result = await generateNoteArticle({
        cluster,
        items: clusterItems,
        experiences: selected,
        brand: brandFile.brand,
        genre,
        articleType: body.articleType ?? "free",
        affiliate,
        policy,
        pastPosts,
        authorViewpoint: body.personalAngle?.trim() || undefined,
      });

      if (result.error) {
        response.noteError = result.error;
      } else if (result.article) {
        const queue = await loadNoteQueue();
        await saveNoteQueue({ ...queue, articles: [result.article, ...queue.articles] });
        response.article = result.article;
        response.noteWarning = result.warning;
      }
    }

    // 候補を「使用済み」にして、次回のリサーチで重複減点の対象にする
    await saveClusters(
      clusters.map((c) => (c.id === cluster.id ? { ...c, status: "used" as const } : c))
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成に失敗しました";
    console.error("[api/note/content/generate] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
