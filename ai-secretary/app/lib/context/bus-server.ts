import fs from "fs";
import { ContextBus, serializeBus, parseBus, createDefaultBus } from "./bus";
import { getBusFilePath, getBusDir } from "../runtime/bus";

// Resolved via runtime/bus.ts — supports local (memory/) and Vercel (/tmp) environments
const BUS_FILE_PATH = getBusFilePath();

/**
 * Loads ContextBus state from JSON file
 */
export async function loadBus(): Promise<ContextBus> {
  try {
    if (fs.existsSync(BUS_FILE_PATH)) {
      const content = fs.readFileSync(BUS_FILE_PATH, "utf-8");
      if (content && content.trim()) {
        return parseBus(content);
      }
    }
  } catch (e) {
    console.warn(`[bus-server] Bus file not found or invalid at ${BUS_FILE_PATH}, using default.`, e);
  }
  return createDefaultBus();
}

/**
 * Saves ContextBus state to JSON file
 */
export async function saveBus(bus: ContextBus): Promise<void> {
  const dir = getBusDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BUS_FILE_PATH, serializeBus(bus), "utf-8");
}
