import fs from "node:fs/promises";
import path from "node:path";
import { VAULT_ROOT } from "../../runtime/paths";
let busy = false;
export async function executionTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (busy) throw new Error("EXECUTION_BUSY");
  busy = true;
  let lock: string | undefined;
  try {
    if (VAULT_ROOT) {
      const root = await fs.realpath(VAULT_ROOT);
      lock = path.join(root, ".company-execution-lock");
      try {
        await fs.mkdir(lock);
      } catch {
        lock = undefined;
        throw new Error("EXECUTION_BUSY");
      }
    }
    return await operation();
  } finally {
    try {
      if (lock) await fs.rmdir(lock);
    } finally {
      busy = false;
    }
  }
}
/** Remote Vault writes and worker execution are outside Phase 7. */
export function assertLocalRunnerStorage() {
  if (
    !VAULT_ROOT ||
    process.env.GITHUB_OWNER ||
    process.env.GITHUB_REPO ||
    process.env.VERCEL
  )
    throw new Error("LOCAL_RUNNER_STORAGE_REQUIRED");
}
