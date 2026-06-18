import fs from "fs";
import path from "path";
import { CompanyType } from "../config/projects";
import { VAULT_ROOT } from "../runtime/paths";

// Vault root resolved via runtime/paths.ts (single source of truth)
const MEMORY_DIR = VAULT_ROOT;

export type CaptureEvent = {
  id: string;
  source: "chat" | "voice" | "api" | "line";
  company: CompanyType;
  text: string;
  createdAt: string;
};

/**
 * Saves a raw user input as a capture event markdown file.
 * Personal: memory/personal/capture/YYYY/MM/CAP-YYYYMMDD-XXX.md
 * Crestix:  memory/crestix/capture/YYYY/MM/CAP-YYYYMMDD-XXX.md
 */
export async function saveCaptureEvent(
  text: string,
  source: "chat" | "voice" | "api" | "line" = "chat",
  company: CompanyType = "personal"
): Promise<CaptureEvent> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  const captureBase = company === "crestix"
    ? path.join(MEMORY_DIR, "crestix", "capture")
    : path.join(MEMORY_DIR, "personal", "capture");

  const targetDir = path.join(captureBase, year, month);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Find the next available file index
  let idx = 1;
  while (idx < 1000) {
    const fileId = `CAP-${dateStr}-${String(idx).padStart(3, "0")}`;
    const filePath = path.join(targetDir, `${fileId}.md`);
    if (!fs.existsSync(filePath)) {
      const event: CaptureEvent = {
        id: fileId,
        source,
        company,
        text,
        createdAt: now.toISOString(),
      };

      const fileContent = `---
id: "${event.id}"
type: "raw_capture"
source: "${event.source}"
company: "${event.company}"
classified: false
createdAt: "${event.createdAt}"
---
${event.text}
`;
      fs.writeFileSync(filePath, fileContent, "utf-8");
      return event;
    }
    idx++;
  }

  throw new Error("Too many capture files created today.");
}
