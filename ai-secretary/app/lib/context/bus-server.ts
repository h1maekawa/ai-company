import { getVaultFile, saveVaultFile } from "../vault";
import { ContextBus, serializeBus, parseBus, createDefaultBus } from "./bus";

const BUS_FILE_PATH = "memory/context/current-bus.md";

/**
 * Loads ContextBus state from Obsidian vault
 */
export async function loadBus(): Promise<ContextBus> {
  try {
    const { content } = await getVaultFile(BUS_FILE_PATH);
    if (content && content.trim()) {
      return parseBus(content);
    }
  } catch (e) {
    console.warn(`[DEBUG] Current bus file not found at ${BUS_FILE_PATH}, using default.`, e);
  }
  return createDefaultBus();
}

/**
 * Saves ContextBus state to Obsidian vault
 */
export async function saveBus(bus: ContextBus): Promise<void> {
  const content = serializeBus(bus);
  await saveVaultFile(BUS_FILE_PATH, content);
}
