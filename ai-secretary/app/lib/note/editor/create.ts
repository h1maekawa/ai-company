import { loadMaemichiBrandRules } from "./brandRules";
import { getLocalAiEditorConfig } from "./config";
import { createLocalAiReviewJob } from "./jobs";
import type {
  LocalAiReviewInput,
  ReviewDestination,
  ReviewPurpose,
  ReviewStrength,
} from "./types";
import { loadExperiences, loadResearchSettings } from "../research/store";

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
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return values
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

export async function enqueueLocalAiReview(
  body: Record<string, unknown>,
  requestedBy: string
) {
  const config = getLocalAiEditorConfig();
  if (!config.enabled) throw new Error("Local AI添削は停止中です");

  const settings = await loadResearchSettings();
  if (!settings.flags.localAiEditorEnabled) {
    throw new Error("Note事業部のLocal AI添削スイッチがOFFです");
  }

  const destination = String(body.destination) as ReviewDestination;
  const purpose = String(body.purpose) as ReviewPurpose;
  const strength = String(body.strength) as ReviewStrength;
  const originalText = String(body.originalText ?? "").trim();
  if (!DESTINATIONS.has(destination) || !PURPOSES.has(purpose) || !STRENGTHS.has(strength)) {
    throw new Error("入力項目が不正です");
  }
  if (originalText.length < 10 || originalText.length > 20_000) {
    throw new Error("元文章は10〜20,000文字で入力してください");
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
    requestedBy: requestedBy.slice(0, 100),
  };
  return createLocalAiReviewJob(input, { brandRules, verifiedExperiences });
}
