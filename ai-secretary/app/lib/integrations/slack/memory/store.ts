import { createHash } from "node:crypto";
import { getVaultFile, updateVaultFile } from "../../../vault";
import { assertAiAutoWritable } from "../../../knowledge/writePolicy";
import type { ConversationArtifact, MemoryTurn, SlackMemorySource } from "./types";

export const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
export const jstDate = (at: string) => new Date(Date.parse(at) + 9 * 3600000).toISOString().slice(0, 10);
export function conversationPath(source: SlackMemorySource): string {
  if (!/^[A-Z0-9]+$/.test(source.channel) || (source.threadTs && !/^\d+\.\d+$/.test(source.threadTs))) throw new Error("INVALID_SLACK_MEMORY_SOURCE");
  const day = jstDate(source.at);
  return `memory/conversations/slack/${day.slice(0, 4)}/${day.slice(5, 7)}/${day}-${source.channel}-${source.threadTs ?? "root"}.md`;
}
export function assertConversationPath(path: string) {
  if (!/^memory\/conversations\/slack\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-[A-Z0-9]+-(?:root|\d+\.\d+)\.md$/.test(path)) throw new Error("INVALID_CONVERSATION_PATH");
}
export function parseConversation(content: string): ConversationArtifact | null {
  if (!content.trim()) return null;
  const match = content.match(/\n<!-- slack-memory-v1:([A-Za-z0-9+/=]+) -->\s*$/);
  if (!match) throw new Error("INVALID_CONVERSATION_ARTIFACT");
  const value = JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as ConversationArtifact;
  if (value.version !== 1 || !Array.isArray(value.turns)) throw new Error("INVALID_CONVERSATION_ARTIFACT");
  return value;
}
export function renderConversation(a: ConversationArtifact): string {
  const yaml: Record<string, unknown> = {
    type: "slack_conversation", version: 1, source: "slack", channel_type: "im",
    slack_permalink: a.turns.find((t) => t.source.permalink)?.source.permalink ?? null,
    research_artifact_refs: a.researchArtifactRefs, generated_artifact_refs: a.generatedArtifactRefs,
    channel_id: a.channel, thread_ts: a.threadTs, root_ts: a.rootTs,
    started_at: a.startedAt, updated_at: a.updatedAt, message_count: a.turns.length,
    classification: a.analysis?.categories ?? [], tags: a.analysis?.tags ?? [],
    has_decision: !!a.analysis?.decisions.length, has_next_action: !!a.analysis?.nextActions.length,
    has_knowledge_candidate: !!a.analysis?.knowledgeCandidates.length,
    redacted: a.turns.some((t) => t.redacted), status: a.status, pipeline_status: a.pipelineStatus,
    save_reason: "automatic DM conversation record", timezone: "Asia/Tokyo",
  };
  // Encoded machine state cannot be confused with fenced code/markers in arbitrary user text.
  const raw = a.turns.map((t) => `### ${new Date(Date.parse(t.at) + 9 * 3600000).toISOString().slice(11, 19)} ${t.role === "user" ? "User" : "AI"}\n\n${t.text}\n${t.transcript !== undefined ? `\n> Transcript\n\n${t.transcript}\n` : ""}\nSlack: ${JSON.stringify({ ...t.source, channel_type: "im", input_type: t.inputType, reply_to_event_id: t.replyToEventId, message_ts: t.messageTs, audio: t.audio, redacted: t.redacted })}\n`).join("\n---\n\n");
  const lines = (items: { text: string }[] = [], task = false) => items.map((i) => `- ${task ? "[ ] " : ""}${i.text}`).join("\n");
  return `---\n${Object.entries(yaml).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n# Slack Conversation\n\n## Conversation\n\n${raw}\n## Summary\n\n${a.analysis?.summary ?? "未生成"}\n\n## Decisions\n\n${lines(a.analysis?.decisions)}\n\n## Next Actions\n\n${lines(a.analysis?.nextActions, true)}\n\n## Derived Artifacts\n\n${a.derived.map((d) => `- ${d.kind}: [[${d.path}]]`).join("\n")}\n\n## Research / Generated References\n\n${[...a.researchArtifactRefs, ...a.generatedArtifactRefs].map((ref) => `- ${ref}`).join("\n")}\n\n<!-- slack-memory-v1:${Buffer.from(JSON.stringify(a)).toString("base64")} -->\n`;
}
export async function loadConversation(path: string) {
  assertConversationPath(path);
  return parseConversation((await getVaultFile(path)).content);
}
export async function editConversation(path: string, edit: (a: ConversationArtifact | null) => ConversationArtifact) {
  assertConversationPath(path);
  await updateVaultFile(path, (content) => {
    // User text is data, not ownership metadata.
    assertAiAutoWritable(path, content.split("\n---\n")[0]);
    return renderConversation(edit(parseConversation(content)));
  });
}
export async function appendTurn(path: string, turn: MemoryTurn) {
  let created = false;
  let inserted = false;
  await editConversation(path, (existing) => {
    created = existing === null; inserted = false;
    const a: ConversationArtifact = existing ?? {
      version: 1, path, channel: turn.source.channel, threadTs: turn.source.threadTs,
      rootTs: turn.source.threadTs ?? turn.source.ts, startedAt: turn.at, updatedAt: turn.at,
      status: "active", pipelineStatus: "RAW_SAVED", turns: [], analyzedTurnIds: [],
      derived: [], researchArtifactRefs: [], generatedArtifactRefs: [],
    };
    if (a.turns.some((t) => t.id === turn.id)) return a;
    inserted = true;
    a.turns.push(turn);
    a.turns.sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id));
    a.startedAt = a.turns[0].at;
    a.updatedAt = a.turns[a.turns.length - 1].at;
    a.status = "active";
    a.pipelineStatus = turn.role === "user" ? "RAW_SAVED" : "AI_REPLIED";
    return a;
  });
  return { created, inserted };
}
