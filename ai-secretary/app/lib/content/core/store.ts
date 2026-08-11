/**
 * Content Core の Vault ストア。Material / ContentCandidate を保持する。
 * 既存Note事業部と同じ「人間可読Markdown＋末尾jsonブロック」形式。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { ContentCandidate, Material } from "./types";

const ROOT = "memory/personal/note";

export const CONTENT_CORE_PATHS = {
  core: `${ROOT}/content-core.md`,
} as const;

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await getVaultFile(path);
    return extractJson<T>(file.content || "");
  } catch {
    return null;
  }
}

async function write(path: string, markdown: string): Promise<void> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(path, markdown, sha);
}

function buildDoc(title: string, note: string, humanBody: string, data: unknown): string {
  return `---
type: ${title}
updated: ${new Date().toISOString()}
---

# ${title}

${note}

${humanBody}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

export type ContentCoreFile = {
  materials: Material[];
  candidates: ContentCandidate[];
};

const MAX_MATERIALS = 500;

export async function loadContentCore(): Promise<ContentCoreFile> {
  const data = await readJson<ContentCoreFile>(CONTENT_CORE_PATHS.core);
  return {
    materials: Array.isArray(data?.materials) ? data.materials : [],
    candidates: Array.isArray(data?.candidates) ? data.candidates : [],
  };
}

export async function saveContentCore(file: ContentCoreFile): Promise<ContentCoreFile> {
  const materials = [...file.materials]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_MATERIALS);
  const safeFile = { materials, candidates: file.candidates };

  const human = [
    `Material: ${materials.length}件 / ContentCandidate: ${safeFile.candidates.length}件`,
    "",
    "## 発信材料（Material）",
    materials
      .slice(0, 30)
      .map((m) => `- [${m.status}][${m.sourceType}] ${m.title}`)
      .join("\n") || "（まだありません）",
    "",
    "## 候補（ContentCandidate）",
    safeFile.candidates
      .slice(0, 30)
      .map((c) => `- [${c.status}] ${c.title} — ${c.whyInteresting}`)
      .join("\n") || "（まだありません）",
  ].join("\n");

  await write(
    CONTENT_CORE_PATHS.core,
    buildDoc(
      "note_content_core",
      "Note・X共通の発信材料です。Timeboxはこの中の1つのsource（sourceType: timebox）に過ぎず、無くてもNote/Xは単独で完結します。",
      human,
      safeFile
    )
  );
  return safeFile;
}

export async function upsertMaterial(material: Material): Promise<Material> {
  const file = await loadContentCore();
  const index = file.materials.findIndex((m) => m.id === material.id);
  const next = { ...material, updatedAt: new Date().toISOString() };
  if (index >= 0) file.materials[index] = next;
  else file.materials.unshift(next);
  await saveContentCore(file);
  return next;
}

export async function upsertCandidate(candidate: ContentCandidate): Promise<ContentCandidate> {
  const file = await loadContentCore();
  const index = file.candidates.findIndex((c) => c.id === candidate.id);
  if (index >= 0) file.candidates[index] = candidate;
  else file.candidates.unshift(candidate);
  await saveContentCore(file);
  return candidate;
}
