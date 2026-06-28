import path from "path";
import fs from "fs";
import { resolveRawPath } from "./paths";

let cachedBusFilePath: string | null = null;

/**
 * Resolves the path to current-bus.json based on the runtime environment.
 *
 * - Vercel (process.env.VERCEL === "1" or Read-Only Filesystem):
 *     Uses /tmp/current-bus.json as a temporary fallback.
 *     NOTE: /tmp is NOT persistent across Vercel invocations (cold start = data loss).
 *     For production use with persistent inboxQueue/taskPipeline, migrate to Upstash Redis.
 *
 * - Local (default):
 *     Uses memory/current-bus.json inside the configured Obsidian vault.
 */
export function getBusFilePath(): string {
  if (cachedBusFilePath) {
    return cachedBusFilePath;
  }

  if (process.env.VERCEL === "1") {
    cachedBusFilePath = "/tmp/current-bus.json";
    return cachedBusFilePath;
  }

  const primaryPath = resolveRawPath("memory/current-bus.json");
  const dir = path.dirname(primaryPath);

  try {
    // Ensure the directory exists or attempt to create it.
    // In a read-only filesystem, mkdirSync or accessSync will throw an error.
    if (fs.existsSync(dir)) {
      fs.accessSync(dir, fs.constants.W_OK);
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
    cachedBusFilePath = primaryPath;
  } catch (err: any) {
    if (err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM") {
      console.warn(`[bus] Primary path directory is not writable (${err.code}). Falling back to /tmp/current-bus.json.`);
      cachedBusFilePath = "/tmp/current-bus.json";
    } else {
      cachedBusFilePath = primaryPath;
    }
  }

  return cachedBusFilePath;
}

/**
 * Returns the directory containing the bus file.
 * Used when ensuring the directory exists before writing.
 */
export function getBusDir(): string {
  return path.dirname(getBusFilePath());
}
