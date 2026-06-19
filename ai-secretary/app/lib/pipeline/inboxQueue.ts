import { ContextBus, InboxItem, getActiveBus, setActiveBus } from "../context/bus";
import { saveBus } from "../context/bus-server";
import { CompanyType } from "../config/projects";
import { getVaultFile, saveVaultFile } from "../vault";

function getInboxVaultPath(company: CompanyType, dateStr: string): string {
  const tenant =
    company === "company" || company === "crestix" ? "company" : "personal";
  return `memory/${tenant}/inbox/${dateStr}.md`;
}

/**
 * Adds a raw capture text into the active company's InboxQueue.
 * Also persists/syncs the queue into memory/{company}/inbox/YYYY-MM-DD.md
 * via saveVaultFile (EROFS-safe, works on Vercel and local).
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

  // Target the correct company's bus (company > crestix > personal)
  const targetCompanyBus =
    targetCompany === "company" ? (bus.company ?? bus.crestix) :
    targetCompany === "crestix" ? bus.crestix :
    bus.personal;
  if (!targetCompanyBus) throw new Error(`Bus segment not found for: ${targetCompany}`);
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

  // Sync to memory/{company}/inbox/YYYY-MM-DD.md via Vault (EROFS-safe)
  const vaultPath = getInboxVaultPath(targetCompany, dateStr);
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

  try {
    const existing = await getVaultFile(vaultPath);
    await saveVaultFile(vaultPath, mdContent, existing.sha);
  } catch (err) {
    // Vault write failure should not block inbox queue save (fail-open)
    console.warn(`[inboxQueue] Vault write failed for ${vaultPath}`, err);
  }

  await saveBus(updatedBus);
  return updatedBus;
}
