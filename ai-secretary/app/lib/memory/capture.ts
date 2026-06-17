import fs from "fs";
import path from "path";

const WORKSPACE_DIR = "/Users/maekawahiroyuki/Desktop/ai-company";
const CAPTURE_BASE_DIR = path.join(WORKSPACE_DIR, "memory", "capture");

export type CaptureEvent = {
  id: string;
  source: "chat" | "voice" | "api" | "line";
  text: string;
  createdAt: string;
};

/**
 * Saves a raw user input as a capture event markdown file.
 * Structure: memory/capture/YYYY/MM/CAP-YYYYMMDD-XXX.md
 */
export async function saveCaptureEvent(
  text: string,
  source: "chat" | "voice" | "api" | "line" = "chat"
): Promise<CaptureEvent> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  const targetDir = path.join(CAPTURE_BASE_DIR, year, month);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Get index count (find next non-existent file index)
  let idx = 1;
  while (idx < 1000) {
    const fileId = `CAP-${dateStr}-${String(idx).padStart(3, "0")}`;
    const filePath = path.join(targetDir, `${fileId}.md`);
    if (!fs.existsSync(filePath)) {
      const event: CaptureEvent = {
        id: fileId,
        source,
        text,
        createdAt: now.toISOString(),
      };

      const fileContent = `---
id: "${event.id}"
type: "raw_capture"
source: "${event.source}"
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
