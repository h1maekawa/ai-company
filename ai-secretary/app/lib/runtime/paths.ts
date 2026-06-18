import path from "path";

/**
 * Resolves the vault root directory based on the runtime environment.
 *
 * The vault root is the top-level directory containing all memory files.
 * Current structure:
 *   ai-company/
 *   ├── memory/          ← VAULT_ROOT points here
 *   └── ai-secretary/    ← process.cwd() when running npm run dev
 *
 * Future (Phase 7 physical split):
 *   personal-os/vault/  and  company-os/vault/
 * At that point, PersonalVaultProvider / CompanyVaultProvider will override this.
 */
export const VAULT_ROOT: string = (() => {
  // In Vercel, /tmp is the only writable location.
  // Read-only vault files are served from the build snapshot (not applicable here
  // since vault is a live Dropbox folder, not bundled). For now, vault root
  // remains the same in both environments — only bus.ts write path differs.
  return path.resolve(process.cwd(), "..", "memory");
})();

/**
 * Resolves an absolute path for a vault-relative file path.
 * @param vaultRelativePath e.g. "personal/fund/positions.md"
 */
export function resolveVaultPath(vaultRelativePath: string): string {
  // Normalize: strip leading "memory/" or "vault/" prefix if callers pass it
  const clean = vaultRelativePath
    .replace(/^memory\//, "")
    .replace(/^vault\//, "");
  return path.join(VAULT_ROOT, clean);
}

/**
 * Resolves a path that may already include "memory/" or "vault/" prefix,
 * or may be a bare relative path. Handles both caller conventions safely.
 */
export function resolveRawPath(rawPath: string): string {
  if (path.isAbsolute(rawPath)) return rawPath;
  return resolveVaultPath(rawPath);
}
