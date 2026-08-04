import type { MediaSuggestion, OutputType, XPostLength, XPostPattern } from "./types";

export const X_LENGTH_GUIDE: Record<XPostLength, string> = {
  short: "80〜160文字",
  standard: "161〜280文字",
  long: "280文字を超える長文投稿",
};

export function normalizeXPattern(value: string | undefined, outputType: OutputType): XPostPattern {
  if (outputType === "x-and-note") return "note-link";
  if (value === "save" || value === "conversation") return value;
  return "opinion";
}

export function normalizeMediaSuggestion(value?: string): MediaSuggestion {
  const allowed: MediaSuggestion[] = ["text", "diagram", "screenshot", "comparison", "chart", "video", "note-thumbnail"];
  return allowed.includes(value as MediaSuggestion) ? value as MediaSuggestion : "text";
}

export function expectedDraftCount(outputType: OutputType): { min: number; max: number } {
  if (outputType === "x-thread") return { min: 2, max: 7 };
  if (outputType === "x-and-note") return { min: 5, max: 5 };
  return { min: 3, max: 3 };
}
