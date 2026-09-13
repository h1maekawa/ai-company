import fs from "node:fs/promises";
import path from "node:path";
import { VAULT_ROOT } from "../../runtime/paths";
import { getRedisClient } from "../../utils/redis";
import { assertProductionMutationAllowed } from "../runtime/environment";
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
/** Runner requires local storage in development or durable Redis in production. */
export function assertLocalRunnerStorage() {
  assertProductionMutationAllowed();
  if (!VAULT_ROOT && !getRedisClient()) throw new Error("DURABLE_EXECUTION_STORE_REQUIRED");
}
