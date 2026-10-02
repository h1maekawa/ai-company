import { updateVaultFile } from "../../../vault";
import { assertAiAutoWritable } from "../../../knowledge/writePolicy";
import { fingerprint, jstDate } from "./store";
import { redactMemoryText } from "./privacy";

export type CeoDecision = { subjectType: "approval" | "opportunity"; subjectId: string; title: string; decision: "GO" | "WAIT" | "PASS" | "APPROVED" | "REJECTED"; reason: string | null; decidedAt: string; slackUserId: string; channel: string | null; messageTs: string | null };
export async function saveCeoDecision(decision: CeoDecision) {
  const input = { ...decision, title: redactMemoryText(decision.title).text, reason: decision.reason === null ? null : redactMemoryText(decision.reason).text };
  const id = fingerprint(`${input.subjectType}:${input.subjectId}:${input.decision}`);
  const path = `memory/decisions/slack/${id}.md`;
  await updateVaultFile(path, (content) => {
    assertAiAutoWritable(path, content.split("\n---\n")[0]);
    if (content.trim()) return content;
    return `---\ntype: ceo_decision\nmanaged_by: ai\nsource: slack\nsubject_type: ${input.subjectType}\nsubject_id: ${JSON.stringify(input.subjectId)}\ndecision: ${input.decision}\ndecided_at: ${JSON.stringify(input.decidedAt)}\ndate: ${jstDate(input.decidedAt)}\nslack_user_id: ${JSON.stringify(input.slackUserId)}\nslack_channel: ${JSON.stringify(input.channel)}\nslack_message_ts: ${JSON.stringify(input.messageTs)}\n---\n\n# ${input.title}\n\n## Decision\n\n${input.decision}\n\n## Reason\n\n${input.reason?.trim() || "（理由未入力）"}\n`;
  });
  return path;
}
