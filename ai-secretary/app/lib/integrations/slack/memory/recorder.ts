import { AsyncLocalStorage } from "node:async_hooks";
import type { SlackAudioFile } from "../voice";
import { recordOperation, drainSlackMemoryJobs, memoryLog } from "./jobs";
import { conversationPath } from "./store";
import { readableBlocks, redactMemoryText } from "./privacy";
import type { SlackMemorySource } from "./types";

type RecordingContext = { source: SlackMemorySource; path: string; sequence: number; generated: string[]; research: string[]; confirmedViewpoint?: string };
const context = new AsyncLocalStorage<RecordingContext>();
export type IncomingMemoryEvent = { eventId?: string; channel: string; user?: string; ts?: string; threadTs?: string; text: string; audio?: SlackAudioFile };

/** Called inside runInBackground: raw user attempt always precedes application processing. */
export async function withSlackConversationMemory(event: IncomingMemoryEvent, processMessage: () => Promise<unknown>): Promise<void> {
  let source: SlackMemorySource;
  let path: string;
  try {
    const ts = event.ts ?? `${Date.now() / 1000}`;
    source = { eventId: event.eventId ?? `message:${event.channel}:${ts}`, channel: event.channel,
      user: event.user ?? null, ts, threadTs: event.threadTs ?? null,
      at: new Date(Number(ts) * 1000).toISOString(), permalink: null };
    path = conversationPath(source);
  } catch { memoryLog("MEMORY_INVALID_SOURCE"); await processMessage(); return; }
  const at = source.at;
  const safe = redactMemoryText(event.text);
  const audio = event.audio ? {
    id: event.audio.id ? redactMemoryText(event.audio.id).text : null,
    filename: event.audio.name ? redactMemoryText(event.audio.name).text : null,
    mimetype: event.audio.mimetype ? redactMemoryText(event.audio.mimetype).text : null,
  } : undefined;
  const ctx: RecordingContext = { source, path, sequence: 0, generated: [], research: [] };
  await context.run(ctx, async () => {
    await recordOperation({ kind: "turn", path, turn: { id: `user:${source.eventId}`, role: "user", text: safe.text,
      at, source, inputType: audio ? "audio" : "text", audio,
      redacted: safe.redacted || Boolean(audio && [audio.id, audio.filename, audio.mimetype].some((value) => value?.includes("[REDACTED_SECRET]"))) } }, source.eventId);
    try { await processMessage(); }
    finally {
      if (ctx.generated.length || ctx.research.length) await recordOperation({ kind: "refs", path, research: ctx.research, generated: ctx.generated }, source.eventId);
      const operation = { kind: "analyze" as const, path, throughTurnId: `user:${source.eventId}`, force: false, confirmedViewpoint: ctx.confirmedViewpoint };
      await recordOperation(operation, source.eventId);
      await recordOperation({ ...operation, force: true }, source.eventId, 30 * 60000);
      await drainSlackMemoryJobs(1);
    }
  });
}
export async function recordSlackTranscript(text: string) {
  const ctx = context.getStore(); if (!ctx) return;
  const safe = redactMemoryText(text);
  await recordOperation({ kind: "transcript", path: ctx.path, turnId: `user:${ctx.source.eventId}`, text: safe.text, redacted: safe.redacted }, ctx.source.eventId);
}
export function recordSlackArtifactRefs(refs: { research?: string[]; generated?: string[]; confirmedViewpoint?: string }) {
  const ctx = context.getStore(); if (!ctx) return;
  ctx.research.push(...(refs.research ?? []).map((ref) => redactMemoryText(ref).text));
  ctx.generated.push(...(refs.generated ?? []).map((ref) => redactMemoryText(ref).text));
  if (refs.confirmedViewpoint) ctx.confirmedViewpoint = redactMemoryText(refs.confirmedViewpoint).text;
}
export async function recordSlackReply(text: string, blocks: Record<string, unknown>[] | undefined, channel: string, threadTs?: string, messageTs?: string) {
  const ctx = context.getStore();
  if (!ctx || ctx.source.channel !== channel || (ctx.source.threadTs ?? undefined) !== threadTs) return;
  try {
    // Generated content has its own canonical artifact: retain acknowledgement + refs only.
    const visible = ctx.generated.length ? text : [text, readableBlocks(blocks)].filter(Boolean).join("\n\n");
    const safe = redactMemoryText(visible);
    const sequence = ctx.sequence++;
    await recordOperation({ kind: "turn", path: ctx.path, turn: {
      id: `assistant:${ctx.source.eventId}:${sequence}`, role: "assistant", text: safe.text,
      at: new Date().toISOString(), source: ctx.source, replyToEventId: ctx.source.eventId, messageTs,
      inputType: "text", redacted: safe.redacted, blockTypes: blocks?.map((b) => String(b.type ?? "unknown")),
    } }, ctx.source.eventId);
  } catch { memoryLog("MEMORY_REPLY_CAPTURE_FAILED"); }
}
