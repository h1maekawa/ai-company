import { updateVaultFile } from "../../../vault";
import { captureKnowledgeCandidate } from "../../../knowledge/captureService";
import { canAiAutoWrite, assertAiAutoWritable } from "../../../knowledge/writePolicy";
import type { InboxItem } from "../../../context/bus";
import { fingerprint, jstDate } from "./store";
import type { ConversationArtifact, ExtractedItem, MemoryAnalysis } from "./types";

export function itemFingerprint(kind: string, item: ExtractedItem): string {
  return fingerprint(`${kind}:${item.category}:${item.text.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[。.!！]+$/, "")}`);
}
export async function promoteMemoryCandidates(a: ConversationArtifact, analysis: MemoryAnalysis) {
  const links: ConversationArtifact["derived"] = [];
  for (const [kind, items] of [["decision", analysis.decisions], ["task", analysis.nextActions], ["knowledge", analysis.knowledgeCandidates]] as const) {
    for (const item of items) {
      if (item.confidence !== "explicit") continue;
      const id = itemFingerprint(kind, item);
      const prior = a.derived.find((d) => d.fingerprint === id);
      if (prior) { links.push(prior); continue; }
      const source = `\n## Source\n\n[[${a.path}]]\n\nsource_event_ids: ${JSON.stringify(item.sourceEventIds)}\nsave_reason: ${item.saveReason}\n\n## Evidence\n\n${item.evidence}\n`;
      let path: string;
      if (kind === "knowledge") {
        const captured = await captureKnowledgeCandidate({
          content: `# ${item.text}\n\n${source}`, title: item.text.slice(0, 100),
          source: "conversation", organize: false, idempotencyKey: `slack-memory:${id}`,
        });
        if (!captured.ok || !captured.path) throw new Error("MEMORY_PROMOTION_FAILED");
        path = captured.path;
        // Add additional provenance without resetting a human-reviewed lifecycle status.
        await updateVaultFile(path, (content) => content.includes(`[[${a.path}]]`) || !canAiAutoWrite(path, content).allowed ? content : `${content}\n${source}`);
      } else {
        // Content-addressed names make normalized exact dedupe work across conversations and dates.
        path = kind === "decision" ? `memory/decisions/slack/${id}.md` : `memory/planning/task-candidates/slack-${id}.md`;
        const task: InboxItem = { id: `slack-${id}`, rawText: item.evidence, title: item.text, content: source,
          approvalStatus: "pending", company: "personal", type: "task", createdAt: item.decidedAt };
        const document = `---\ntype: ${kind === "task" ? "task_candidate" : "decision"}\nstatus: ${kind === "task" ? "pending" : "active"}\nmanaged_by: ai\nsource: slack\nsource_conversation: ${JSON.stringify(a.path)}\nsource_event_ids: ${JSON.stringify(item.sourceEventIds)}\nsave_reason: ${JSON.stringify(item.saveReason)}\ncreated_at: ${JSON.stringify(item.decidedAt)}\ndate: ${jstDate(item.decidedAt)}\ncategory: ${item.category}\n---\n\n# ${item.text}\n\n${source}${kind === "task" ? `\n\`\`\`json\n${JSON.stringify(task, null, 2)}\n\`\`\`\n` : ""}`;
        await updateVaultFile(path, (content) => {
          assertAiAutoWritable(path, content.split("\n---\n")[0]);
          return !content.trim() ? document : content.includes(`[[${a.path}]]`) ? content : `${content}\n${source}`;
        });
      }
      links.push({ kind, path, fingerprint: id });
    }
  }
  return links;
}
