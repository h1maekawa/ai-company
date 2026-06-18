import path from "path";

/**
 * Resolves the path to current-bus.json based on the runtime environment.
 *
 * - Vercel (process.env.VERCEL === "1"):
 *     Uses /tmp/current-bus.json as a temporary fallback.
 *     NOTE: /tmp is NOT persistent across Vercel invocations (cold start = data loss).
 *     For production use with persistent inboxQueue/taskPipeline, migrate to Upstash Redis.
 *
 * - Local (default):
 *     Uses ../memory/current-bus.json relative to the ai-secretary/ working directory.
 *     This is the standard path for local Obsidian/Dropbox vault usage.
 */
export function getBusFilePath(): string {
  if (process.env.VERCEL === "1") {
    // Vercel: /tmp is the only writable directory
    // TODO(phase1b): Replace with Upstash Redis for cross-request persistence
    return "/tmp/current-bus.json";
  }
  // Local: ai-secretary/ is cwd, memory/ is one level up
  return path.resolve(process.cwd(), "..", "memory", "current-bus.json");
}

/**
 * Returns the directory containing the bus file.
 * Used when ensuring the directory exists before writing.
 */
export function getBusDir(): string {
  return path.dirname(getBusFilePath());
}
