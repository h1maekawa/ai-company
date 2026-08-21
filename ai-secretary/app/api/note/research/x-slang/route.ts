import { NextRequest, NextResponse } from "next/server";
import { redisSafeGet, redisSafeSet } from "@/app/lib/utils/redis";
import type { SlangEntry } from "@/app/lib/note/research/x-trends";

const KEY = "note:research:x:slang:v1";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ entries: (await redisSafeGet<SlangEntry[]>(KEY)) ?? [] });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as {
    phrase?: string;
    usePolicy?: SlangEntry["usePolicy"];
  };
  if (!body.phrase?.trim() || !["never", "suggest-only", "allowed"].includes(body.usePolicy ?? "")) {
    return NextResponse.json({ error: "phraseとusePolicyが必要です" }, { status: 400 });
  }
  const entries = (await redisSafeGet<SlangEntry[]>(KEY)) ?? [];
  const now = new Date().toISOString();
  const next = entries.map((entry) =>
    entry.phrase === body.phrase
      ? {
          ...entry,
          usePolicy: body.usePolicy!,
          approvedByUser: body.usePolicy !== "suggest-only",
        }
      : entry
  );
  if (!next.some((entry) => entry.phrase === body.phrase)) {
    next.push({
      phrase: body.phrase.trim(),
      sourceCount: 1,
      detectedAt: now,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      genres: [],
      approvedByUser: body.usePolicy !== "suggest-only",
      usePolicy: body.usePolicy!,
    });
  }
  await redisSafeSet(KEY, next);
  return NextResponse.json({ entries: next });
}
