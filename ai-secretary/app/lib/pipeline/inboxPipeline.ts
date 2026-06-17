import fs from "fs";
import path from "path";
import { InboxTask, InboxClassification } from "../router/inbox";
import { ContextBus, TaskNode, pushTask } from "../context/bus";
import { saveBus } from "../context/bus-server";

const WORKSPACE_DIR = "/Users/maekawahiroyuki/Desktop/ai-company";
const INBOX_DIR = path.join(WORKSPACE_DIR, "memory", "inbox");

export interface InboxApprovePayload {
  classification: InboxClassification;
  approvedTasks: InboxTask[];
  rejectedTasks: InboxTask[];
}

/**
 * Pipeline to handle task approval from the Inbox.
 * Persists history to memory/inbox/YYYY-MM-DD.md and adds tasks to the ContextBus pipeline.
 */
export async function processInboxApproval(
  bus: ContextBus,
  payload: InboxApprovePayload
): Promise<ContextBus> {
  const { classification, approvedTasks, rejectedTasks } = payload;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const fileId = `ib-${dateStr}-${timeStr}`;

  // 1. Create directory if not exists
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }

  // 2. Construct Markdown content
  let content = `---\n`;
  content += `id: "${fileId}"\n`;
  content += `type: "inbox_dump"\n`;
  content += `status: "processed"\n`;
  content += `date: "${dateStr}"\n`;
  content += `---\n\n`;

  content += `### Raw Input\n\`\`\`txt\n${classification.rawInput}\n\`\`\`\n\n`;
  
  content += `### Approved Tasks\n`;
  if (approvedTasks.length > 0) {
    approvedTasks.forEach(t => {
      content += `- [${t.department.toUpperCase()}] ${t.title} (Suggested: ${t.suggestedSecretary || "None"}, Reason: ${t.reason})\n`;
    });
  } else {
    content += `(None)\n`;
  }
  content += `\n`;

  content += `### Rejected/Pending Tasks\n`;
  if (rejectedTasks.length > 0) {
    rejectedTasks.forEach(t => {
      content += `- [${t.department.toUpperCase()}] ${t.title}\n`;
    });
  } else {
    content += `(None)\n`;
  }

  const filePath = path.join(INBOX_DIR, `${dateStr}.md`);
  
  let fileContent = "";
  if (fs.existsSync(filePath)) {
    fileContent = fs.readFileSync(filePath, "utf-8") + "\n\n---\n\n" + content;
  } else {
    fileContent = content;
  }
  fs.writeFileSync(filePath, fileContent, "utf-8");

  // 3. Inject tasks into ContextBus pipeline
  let updatedBus = { ...bus };
  
  approvedTasks.forEach(t => {
    // Map to TaskNode
    const taskNode: TaskNode = {
      id: t.id,
      title: t.title,
      owner: t.suggestedSecretary || `executive-coo`,
      status: "approved"
    };
    updatedBus = pushTask(updatedBus, taskNode);
  });

  // Clear pending inbox tasks once processed
  updatedBus.pendingInboxTasks = [];
  
  // Save updated context bus state
  await saveBus(updatedBus);

  return updatedBus;
}
