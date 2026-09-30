import path from "path";
import fs from "fs";

/**
 * Local Vault is an explicit deployment setting. Production GitHub-backed reads
 * do not use this value; local filesystem access fails clearly when unset.
 */
export const VAULT_ROOT = process.env.VAULT_ROOT?.trim() ?? "";

export function resolveVaultPath(relativePath: string) {
  if (!VAULT_ROOT) {
    throw new Error("VAULT_ROOT is required for local Vault filesystem access");
  }
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("UNSAFE_VAULT_PATH");
  }
  const root = path.resolve(VAULT_ROOT);
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(root + path.sep)) throw new Error("UNSAFE_VAULT_PATH");
  // Reject symlinks at every existing component; writes may create missing leaves.
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error("UNSAFE_VAULT_PATH"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return target;
}

export function resolveRawPath(relativePath: string) {
  return resolveVaultPath(relativePath);
}
