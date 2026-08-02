import { NextRequest, NextResponse } from "next/server";
import { getLocalAiEditorConfig } from "@/app/lib/note/editor/config";
import { loadMaemichiBrandRules } from "@/app/lib/note/editor/brandRules";
import { createLocalAiReviewJob } from "@/app/lib/note/editor/jobs";
import type {
  LocalAiReviewInput,
  ReviewDestination,
  ReviewPurpose,
  ReviewStrength,
} from "@/app/lib/note/editor/types";
import { loadExperiences, loadResearchSettings } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

const DESTINATIONS = new Set<ReviewDestination>(["x", "note", "both"]);
const PURPOSES = new Set<ReviewPurpose>([
  "awareness",
  "experience",
  "howto",
  "product",
  "values",
]);
const STRENGTHS = new Set<ReviewStrength>(["light", "structure", "rewrite"]);

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const config = getLocalAiEditorConfig();
    if (!config.enabled) {
      return NextResponse.json({ error: "Local AI添削は停止中です" }, { status: 503 });
    }

    const settings = await loadResearchSettings();
    if (!settings.flags.localAiEditorEnabled) {
      return NextResponse.json(
        { error: "Note事業部のLocal AI添削スイッチがOFFです" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const destination = String(body.destination) as ReviewDestination;
    const purpose = String(body.purpose) as ReviewPurpose;
    const strength = String(body.strength) as ReviewStrength;
    const originalText = String(body.originalText ?? "").trim();
    if (!DESTINATIONS.has(destination) || !PURPOSES.has(purpose) || !STRENGTHS.has(strength)) {
      return NextResponse.json({ error: "入力項目が不正です" }, { status: 400 });
    }
    if (originalText.length < 10 || originalText.length > 20_000) {
      return NextResponse.json(
        { error: "元文章は10〜20,000文字で入力してください" },
        { status: 400 }
      );
    }

    const [brandRules, experiences] = await Promise.all([
      loadMaemichiBrandRules(),
      loadExperiences(),
    ]);
    const verifiedExperiences = experiences
      .filter((entry) => entry.verifiedByUser && !entry.sensitive)
      .slice(0, 30)
      .map((entry) =>
        [
          entry.title,
          entry.summary,
          entry.whatHappened,
          entry.whatWasTried,
          entry.whatWorked,
          entry.whatDidNotWork,
          entry.lesson,
          ...entry.reusableFacts,
        ]
          .filter(Boolean)
          .join(" / ")
      );

    const input: LocalAiReviewInput = {
      destination,
      purpose,
      strength,
      originalText,
      keepExpressions: strings(body.keepExpressions, 20, 500),
      additionalFacts: strings(body.additionalFacts, 50, 1000),
      requestedBy: String(body.requestedBy ?? "web").slice(0, 100),
    };

    const job = await createLocalAiReviewJob(input, {
      brandRules,
      verifiedExperiences,
    });
    return NextResponse.json({ job: { id: job.id, status: job.status } }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添削ジョブを作成できませんでした";
    console.error("[note/editor/jobs] create failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

