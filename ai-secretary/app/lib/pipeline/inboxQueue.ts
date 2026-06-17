import fs from "fs";
import path from "path";
import { ContextBus, InboxItem, getActiveBus, setActiveBus } from "../context/bus";
import { saveBus } from "../context/bus-server";
import { CompanyType } from "../config/projects";

// memory/ は ai-secretary/ の1つ上（ai-company/）にある
const MEMORY_DIR = path.resolve(process.cwd(), "..", "memory");

function getInboxDir(company: CompanyType): string {
  return company === "crestix"
    ? path.join(MEMORY_DIR, "crestix", "inbox")
    : path.join(MEMORY_DIR, "personal", "inbox");
}

/**
 * Adds a raw capture text into the active company's InboxQueue.
 * Also persists/syncs the queue into memory/{company}/inbox/YYYY-MM-DD.md.
 */
export async function addToInboxQueue(
  bus: ContextBus,
  rawText: string,
  company?: CompanyType
): Promise<ContextBus> {
  const targetCompany = company ?? bus.activeCompany;
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const itemId = `IB-${dateStr.replace(/-/g, "")}-${timeStr}`;

  const newItem: InboxItem = {
    id: itemId,
    rawText,
    approvalStatus: "pending",
    createdAt: now.toISOString(),
    company: targetCompany,
  };

  // Target the correct company's bus
  const targetCompanyBus = targetCompany === "crestix" ? bus.crestix : bus.personal;
  const currentQueue = targetCompanyBus.inboxQueue ?? [];
  const updatedQueue = [...currentQueue, newItem];

  const updatedCompanyBus = {
    ...targetCompanyBus,
    inboxQueue: updatedQueue,
    updatedAt: dateStr,
  };

  const updatedBus: ContextBus = {
    ...bus,
    [targetCompany]: updatedCompanyBus,
    updatedAt: dateStr,
  };

  // Sync to memory/{company}/inbox/YYYY-MM-DD.md
  const inboxDir = getInboxDir(targetCompany);
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }
  const filePath = path.join(inboxDir, `${dateStr}.md`);

  let mdContent = `---\ntype: inbox_queue\ncompany: "${targetCompany}"\ndate: "${dateStr}"\n---\n\n`;
  updatedQueue.forEach((item) => {
    mdContent += `### Item: ${item.id}\n`;
    mdContent += `- Status: ${item.approvalStatus}\n`;
    mdContent += `- CreatedAt: ${item.createdAt}\n`;
    if (item.type) mdContent += `- Type: ${item.type}\n`;
    if (item.title) mdContent += `- Title: ${item.title}\n`;
    if (item.priority) mdContent += `- Priority: ${item.priority}\n`;
    if (item.projectId) mdContent += `- ProjectId: ${item.projectId}\n`;
    if (item.suggestedSecretary) mdContent += `- SuggestedSecretary: ${item.suggestedSecretary}\n`;
    mdContent += `- Text:\n\`\`\`txt\n${item.rawText}\n\`\`\`\n\n`;
  });

  fs.writeFileSync(filePath, mdContent, "utf-8");
  await saveBus(updatedBus);

  return updatedBus;
}
