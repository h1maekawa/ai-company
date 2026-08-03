import { getVaultFile, saveVaultFile } from "../../vault";
import type { OwnedXPost, XReferenceNote, XWorkspaceData } from "./types";

const PATH = "memory/personal/note/x-free-workspace.md";

function parse(content: string): XWorkspaceData {
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return { ownedPosts: [], referenceNotes: [] };
  try {
    const data = JSON.parse(match[1]) as Partial<XWorkspaceData>;
    return {
      ownedPosts: Array.isArray(data.ownedPosts) ? data.ownedPosts : [],
      referenceNotes: Array.isArray(data.referenceNotes) ? data.referenceNotes : [],
    };
  } catch {
    return { ownedPosts: [], referenceNotes: [] };
  }
}

export async function loadXWorkspace(): Promise<XWorkspaceData> {
  try {
    return parse((await getVaultFile(PATH)).content);
  } catch {
    return { ownedPosts: [], referenceNotes: [] };
  }
}

export function mergeOwnedPosts(posts: OwnedXPost[]): OwnedXPost[] {
  const byKey = new Map<string, OwnedXPost>();
  for (const post of posts) {
    const key = post.url?.toLowerCase() || `${post.accountId}:${post.text.trim()}`;
    const current = byKey.get(key);
    if (!current || (!current.verifiedByUser && post.verifiedByUser)) byKey.set(key, post);
  }
  return [...byKey.values()].sort((a, b) => (b.postedAt || b.createdAt).localeCompare(a.postedAt || a.createdAt));
}

export async function saveXWorkspace(data: XWorkspaceData): Promise<XWorkspaceData> {
  const safe: XWorkspaceData = {
    ownedPosts: mergeOwnedPosts(data.ownedPosts),
    referenceNotes: data.referenceNotes.map((note) => ({
      ...note,
      excerpt: note.excerpt?.slice(0, 280),
    })),
  };
  let sha: string | undefined;
  try { sha = (await getVaultFile(PATH)).sha; } catch {}
  const human = [
    "# X無料ワークスペース",
    "",
    "X APIを使わず、本人が確認した投稿履歴と参考ポイントだけを保存します。",
    "",
    `- 本人投稿: ${safe.ownedPosts.length}件`,
    `- 参考ポイント: ${safe.referenceNotes.length}件`,
    "",
    "```json",
    JSON.stringify(safe, null, 2),
    "```",
    "",
  ].join("\n");
  await saveVaultFile(PATH, human, sha);
  return safe;
}

export function isOwnedXPost(value: unknown): value is OwnedXPost {
  const item = value as Partial<OwnedXPost>;
  return !!item && typeof item.id === "string" && typeof item.accountId === "string" &&
    typeof item.text === "string" && item.text.length > 0 && item.text.length <= 10_000 &&
    ["ai-secretary", "manual", "x-archive"].includes(item.source ?? "");
}

export function isXReferenceNote(value: unknown): value is XReferenceNote {
  const item = value as Partial<XReferenceNote>;
  return !!item && typeof item.id === "string" && typeof item.postUrl === "string" &&
    typeof item.reason === "string";
}
