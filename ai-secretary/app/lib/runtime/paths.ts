import path from "path";

export const DEFAULT_VAULT_ROOT =
  "/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用/AI会社";

export const VAULT_ROOT: string = (() => {
  return process.env.VAULT_ROOT || DEFAULT_VAULT_ROOT;
})();

export function resolveVaultPath(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(VAULT_ROOT, clean);
}

export function resolveRawPath(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(VAULT_ROOT, clean);
}
