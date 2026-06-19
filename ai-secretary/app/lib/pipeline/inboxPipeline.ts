import { ContextBus, TaskNode, InboxItem, pushTask } from "../context/bus";
import { saveBus } from "../context/bus-server";
import { CompanyType } from "../config/projects";
import { getVaultFile, saveVaultFile } from "../vault";

function getInboxVaultPath(company: CompanyType, dateStr: string): string {
  const tenant =
    company === "company" || company === "crestix" ? "company" : "personal";
  return `memory/${tenant}/inbox/${dateStr}.md`;
}

export interface InboxApprovePayload {
  approvedItems: InboxItem[];
  rejectedItems: InboxItem[];
  company: CompanyType;
}

/**
 * Pipeline to handle task approval from the Inbox.
 * Persists history via saveVaultFile (EROFS-safe) and adds tasks to the
 * correct company's ContextBus pipeline.
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

  // Construct archive Markdown
  let archiveContent = `---\n`;
  archiveContent += `id: "${fileId}"\n`;
  archiveContent += `type: "inbox_dump"\n`;
  archiveContent += `company: "${company}"\n`;
  archiveContent += `status: "processed"\n`;
  archiveContent += `date: "${dateStr}"\n`;
  archiveContent += `---\n\n`;

  archiveContent += `### Approved Items\n`;
  if (approvedItems.length > 0) {
    approvedItems.forEach(item => {
      archiveContent += `- [${(item.type || "task").toUpperCase()}] ${item.title || item.rawText}`;
      if (item.projectId) archiveContent += ` (Project: ${item.projectId})`;
      if (item.priority) archiveContent += ` (Priority: ${item.priority})`;
      if (item.suggestedSecretary) archiveContent += ` (Secretary: ${item.suggestedSecretary})`;
      archiveContent += `\n`;
    });
  } else {
    archiveContent += `(None)\n`;
  }
  archiveContent += `\n### Rejected Items\n`;
  if (rejectedItems.length > 0) {
    rejectedItems.forEach(item => {
      archiveContent += `- ${item.title || item.rawText}\n`;
    });
  } else {
    archiveContent += `(None)\n`;
  }

  // Persist archive via Vault (EROFS-safe)
  const vaultPath = getInboxVaultPath(company, dateStr);
  try {
    const existing = await getVaultFile(vaultPath);
    const fileContent = existing.content
      ? existing.content + "\n\n---\n\n" + archiveContent
      : archiveContent;
    await saveVaultFile(vaultPath, fileContent, existing.sha);
  } catch (err) {
    // Vault write failure should not block pipeline (fail-open)
    console.warn(`[inboxPipeline] Vault write failed for ${vaultPath}`, err);
  }

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
  const targetCompanyBus =
    company === "company" ? (updatedBus.company ?? updatedBus.crestix) :
    company === "crestix" ? updatedBus.crestix :
    updatedBus.personal;
  if (!targetCompanyBus) throw new Error(`Bus segment not found for: ${company}`);
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
