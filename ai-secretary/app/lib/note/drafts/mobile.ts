import { getVaultFile, listVaultEntries } from "@/app/lib/vault";

export const NOTE_DRAFT_ROOT = "memory/personal/note/drafts";

export function validDraftSlug(slug: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(slug) && !slug.includes("..");
}

export function draftMobileUrl(slug: string): string {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${base}/note/drafts/${encodeURIComponent(slug.replace(/\.md$/, ""))}`;
}

export async function loadDraftBySlug(slug: string): Promise<{ content: string; path: string }> {
  const normalized = slug.endsWith(".md") ? slug : `${slug}.md`;
  if (!validDraftSlug(normalized)) throw new Error("下書き名が不正です");
  const path = `${NOTE_DRAFT_ROOT}/${normalized}`;
  const file = await getVaultFile(path);
  if (!file.content) throw new Error("下書きが見つかりません");
  return { content: file.content, path };
}

export async function latestDraftLink(): Promise<{ name: string; url: string } | null> {
  const entries = await listVaultEntries(NOTE_DRAFT_ROOT);
  const latest = entries
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".md") && entry.name !== "README.md")
    .sort((a, b) => b.name.localeCompare(a.name))[0];
  return latest ? { name: latest.name, url: draftMobileUrl(latest.name) } : null;
}
