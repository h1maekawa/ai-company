import type { ConversationArtifact, ConversationCategory, ExtractedItem, MemoryAnalysis, MemoryTurn } from "./types";

const decision = /に決めた|に決定した|これで進める|これにする|今後.*(?:使う|採用する)/;
const action = /(?:明日|来週|あとで|後で).*(?:やる|確認する|調べる)|(?:実装|調査|確認|予約)(?:して|させる)|調べて|(?:予約|Research)する|調べる/;
const reusable = /(?:私は|自分は).*(?:好み|好き|重視|優先)|(?:今後|常に|原則|ルール|方針).*(?:する|使う|しない|優先)|気になっています/;
const uncertain = /[?？]|かもしれ|まだ決め|検討中|決めていない|進めない|取り消|撤回|やめる|と言った|と言っていた|もし|例えば|たとえば|仮に|したい|したら|しないで|不要/;
const categoryRules: [ConversationCategory, RegExp][] = [
  ["investment", /投資|株|銘柄|HBM|ポートフォリオ/i], ["content", /投稿|note|コンテンツ|記事/],
  ["finance", /支出|家計|残高|収入/], ["ai-company", /AI Company|Obsidian|Slack/i],
  ["engineering", /実装|コード|デプロイ|Codex/i], ["knowledge", /知識|学び|ナレッジ/],
  ["planning", /予定|明日|来週|タスク/], ["personal", /好み|好き|自分|私は/],
];
export function classifyMemory(text: string): ConversationCategory[] {
  const found = categoryRules.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  return found.length ? found : ["other"];
}
export function shouldAnalyze(a: ConversationArtifact, force = false): boolean {
  const fresh = a.turns.filter((t) => t.role === "user" && !a.analyzedTurnIds.includes(t.id));
  return fresh.length > 0 && (force || fresh.length >= 5 || fresh.some((t) => decision.test(t.transcript ?? t.text) || action.test(t.transcript ?? t.text) || reusable.test(t.transcript ?? t.text)));
}
function extract(turn: MemoryTurn, pattern: RegExp, saveReason: string): ExtractedItem[] {
  const text = turn.transcript ?? turn.text;
  return text.split(/(?<=[。！？\n])/u).map((s) => s.trim()).filter((s) =>
    s.length > 3 && s.length <= 1000 && pattern.test(s) && !uncertain.test(s) && !/^[>「『]|```/.test(s)
  ).slice(0, 5).map((text) => ({ text, evidence: text, category: classifyMemory(text)[0],
    sourceEventIds: [turn.source.eventId], confidence: "explicit", saveReason, decidedAt: turn.at }));
}
function mergeItems(old: ExtractedItem[], next: ExtractedItem[]) {
  const seen = new Set(old.map((item) => `${item.category}:${item.text.normalize("NFKC").replace(/\s/g, "")}`));
  return [...old, ...next.filter((item) => {
    const key = `${item.category}:${item.text.normalize("NFKC").replace(/\s/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  })];
}
/** v1 uses extractive, literal evidence. No paid model or invented intent; JSON output is typed. */
export async function analyzeConversationMemory(a: ConversationArtifact, confirmedViewpoint?: string): Promise<MemoryAnalysis> {
  const fresh = a.turns.filter((t) => t.role === "user" && !a.analyzedTurnIds.includes(t.id));
  const recent = a.turns.slice(-20);
  const categories = [...new Set([...(a.analysis?.categories ?? []), ...fresh.flatMap((t) => classifyMemory(t.transcript ?? t.text))])];
  const tags = categories.filter((c) => c !== "other").slice(0, 8);
  const summary = recent.filter((t) => t.role === "user").slice(-8).map((t) =>
    `- 本人発言: ${(t.transcript ?? t.text).replace(/\n/g, " ").slice(0, 240)}`
  ).join("\n");
  const preferences = fresh.flatMap((t) => extract(t, reusable, "reusable preference / workflow rule"));
  // Only user-provided text actually present in the transcript is evidence, even if confirmed.
  if (confirmedViewpoint) for (const turn of recent.filter((t) => t.role === "user")) {
    if ((turn.transcript ?? turn.text).includes(confirmedViewpoint) && !uncertain.test(confirmedViewpoint)) {
      preferences.push({ text: confirmedViewpoint, evidence: confirmedViewpoint, category: classifyMemory(confirmedViewpoint)[0],
        sourceEventIds: [turn.source.eventId], confidence: "explicit", saveReason: "confirmed author viewpoint", decidedAt: turn.at });
    }
  }
  return { summary, categories, tags,
    decisions: mergeItems(a.analysis?.decisions ?? [], fresh.flatMap((t) => extract(t, decision, "explicit decision"))),
    nextActions: mergeItems(a.analysis?.nextActions ?? [], fresh.flatMap((t) => extract(t, action, "explicit next action"))),
    knowledgeCandidates: mergeItems(a.analysis?.knowledgeCandidates ?? [], preferences),
  };
}
