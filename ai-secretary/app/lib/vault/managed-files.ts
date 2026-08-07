/** Vault上で物理パスを変更してはいけない、アプリとの契約一覧。 */
export const APP_MANAGED_VAULT_FILES = [
  "memory/personal/profile.md",
  "memory/personal/goals.md",
  "memory/personal/note/brand.md",
  "memory/personal/note/idea-inbox.md",
  "memory/personal/note/affiliate-links.md",
  "memory/personal/note/research-settings.md",
  "memory/personal/note/research-inbox.md",
  "memory/personal/note/trend-clusters.md",
  "memory/personal/note/social-drafts.md",
  "memory/personal/note/note-publish-queue.md",
  "memory/personal/fund/policy.md",
  "memory/personal/fund/capacity.md",
  "memory/personal/fund/holdings.md",
  "memory/personal/fund/recommendations.md",
  "memory/personal/fund/decisions.md",
] as const;

export const APP_MANAGED_VAULT_DIRECTORIES = [
  "memory/personal/planning",
  "memory/personal/note/drafts",
  "memory/personal/fund/investment-log",
  "memory/kaizen",
] as const;

export function isManagedVaultPath(path: string): boolean {
  return (
    APP_MANAGED_VAULT_FILES.some((file) => file === path) ||
    APP_MANAGED_VAULT_DIRECTORIES.some((directory) => path === directory || path.startsWith(`${directory}/`))
  );
}
