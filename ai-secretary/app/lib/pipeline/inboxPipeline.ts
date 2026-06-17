import fs from "fs";
import path from "path";
import { ContextBus, TaskNode, InboxItem, pushTask } from "../context/bus";
import { saveBus } from "../context/bus-server";
import { CompanyType } from "../config/projects";

const WORKSPACE_DIR = "/Users/maekawahiroyuki/Desktop/ai-company";

function getInboxDir(company: CompanyType): string {
  return company === "crestix"
    ? path.join(WORKSPACE_DIR, "memory", "crestix", "inbox")
    : path.join(WORKSPACE_DIR, "memory", "personal", "inbox");
}

export interface InboxApprovePayload {
  approvedItems: InboxItem[];
  rejectedItems: InboxItem[];
  company: CompanyType;
}

/**
 * Pipeline to handle task approval from the Inbox.
 * Persists history and adds tasks to the correct company's ContextBus pipeline.
 */
export async function processInboxApproval(
  bus: ContextBus,
  payload: InboxApprovePayload
): Promise<ContextBus> {
  const { approvedItems, rejectedItems, company } = payload;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const fileId = `ib-${dateStr}-${timeStr}`;

  const inboxDir = getInboxDir(company);
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  // Construct archive Markdown
  let content = `---\n`;
  content += `id: "${fileId}"\n`;
  content += `type: "inbox_dump"\n`;
  content += `company: "${company}"\n`;
  content += `status: "processed"\n`;
  content += `date: "${dateStr}"\n`;
  content += `---\n\n`;

  content += `### Approved Items\n`;
  if (approvedItems.length > 0) {
    approvedItems.forEach(item => {
      content += `- [${(item.type || "task").toUpperCase()}] ${item.title || item.rawText}`;
      if (item.projectId) content += ` (Project: ${item.projectId})`;
      if (item.priority) content += ` (Priority: ${item.priority})`;
      if (item.suggestedSecretary) content += ` (Secretary: ${item.suggestedSecretary})`;
      content += `\n`;
    });
  } else {
    content += `(None)\n`;
  }
  content += `\n### Rejected Items\n`;
  if (rejectedItems.length > 0) {
    rejectedItems.forEach(item => {
      content += `- ${item.title || item.rawText}\n`;
    });
  } else {
    content += `(None)\n`;
  }

  const filePath = path.join(inboxDir, `${dateStr}.md`);
  let fileContent = "";
  if (fs.existsSync(filePath)) {
    fileContent = fs.readFileSync(filePath, "utf-8") + "\n\n---\n\n" + content;
  } else {
    fileContent = content;
  }
  fs.writeFileSync(filePath, fileContent, "utf-8");

  // Temporarily switch active company to target so pushTask works on correct bus
  const originalCompany = bus.activeCompany;
  let updatedBus: ContextBus = { ...bus, activeCompany: company };

  // Inject approved tasks into the correct company's taskPipeline
  const processedIds = new Set([
    ...approvedItems.map(item => item.id),
    ...rejectedItems.map(item => item.id)
  ]);

  approvedItems.forEach(item => {
    if (item.type === "task" || !item.type) {
      const taskNode: TaskNode = {
        id: item.id,
        title: item.title || item.rawText,
        owner: item.suggestedSecretary || "executive-assistant",
        status: "approved",
        projectId: item.projectId,
      };
      updatedBus = pushTask(updatedBus, taskNode);
    }
  });

  // Remove processed items from the company's inboxQueue
  const targetCompanyBus = company === "crestix" ? updatedBus.crestix : updatedBus.personal;
  const cleanedQueue = (targetCompanyBus.inboxQueue ?? []).filter(
    item => !processedIds.has(item.id)
  );
  updatedBus = {
    ...updatedBus,
    [company]: { ...targetCompanyBus, inboxQueue: cleanedQueue },
    activeCompany: originalCompany, // restore original
  };

  await saveBus(updatedBus);
  return updatedBus;
}
