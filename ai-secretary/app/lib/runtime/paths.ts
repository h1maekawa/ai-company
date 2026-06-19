import path from "path";

export const VAULT_ROOT: string = (() => {
  return (
    process.env.VAULT_ROOT ||
    "/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用"
  );
})();

export function resolveVaultPath(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(VAULT_ROOT, clean);
}

export function resolveRawPath(relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(VAULT_ROOT, clean);
}
