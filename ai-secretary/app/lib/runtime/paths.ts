import path from "path";

/**
 * Local Vault is an explicit deployment setting. Production GitHub-backed reads
 * do not use this value; local filesystem access fails clearly when unset.
 */
export const VAULT_ROOT = process.env.VAULT_ROOT?.trim() ?? "";

export function resolveVaultPath(relativePath: string) {
  if (!VAULT_ROOT) {
    throw new Error("VAULT_ROOT is required for local Vault filesystem access");
  }
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(VAULT_ROOT, clean);
}

export function resolveRawPath(relativePath: string) {
  return resolveVaultPath(relativePath);
}
