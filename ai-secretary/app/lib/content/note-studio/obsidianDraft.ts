/**
 * 既存canonical draft path（memory/personal/note/drafts/YYYY-MM-DD-{slug}.md）への保存。
 * 既存の実ファイル（例: 2026-08-03-kirawareru-yuki-first-note.md）と同じfrontmatter規約
 * （type: note_draft, status, created/updated）を踏襲し、Content Business OS用の
 * 追加フィールド（articleSessionId等）だけを付け加える。既存ファイルは書き換えない。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { NoteArticleDraft } from "../../note/research/types";

const DRAFTS_DIR = "memory/personal/note/drafts";

function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "draft";
}

export function draftVaultPath(draft: Pick<NoteArticleDraft, "id" | "title" | "createdAt">): string {
  const date = draft.createdAt.slice(0, 10);
  return `${DRAFTS_DIR}/${date}-${slugify(draft.title)}-${draft.id.slice(-6)}.md`;
}

export function buildDraftMarkdown(draft: NoteArticleDraft, articleSessionId?: string): string {
  const yamlList = (items: string[]) => (items.length ? items.map((i) => `  - ${i}`).join("\n") : "  []");
  return `---
type: note_draft
title: ${JSON.stringify(draft.title)}
status: ${draft.status}
articleSessionId: ${articleSessionId ?? draft.articleSessionId ?? ""}
createdAt: ${draft.createdAt}
updatedAt: ${draft.updatedAt}
materialIds:
${yamlList(draft.materialIds ?? [])}
researchIds:
${yamlList(draft.sourceResearchItemIds ?? [])}
viewpointIds:
${yamlList(draft.sourceViewpointIds ?? [])}
experienceIds:
${yamlList(draft.sourceExperienceIds ?? [])}
contentGoal: ${draft.contentGoal ?? ""}
offerIds:
${yamlList(draft.offerIds ?? [])}
ctaIds:
${yamlList(draft.ctaIds ?? [])}
approvalStatus: ${draft.status}
---

# ${draft.title}

${draft.freeSection}

${draft.paidSection ? `<!-- paid-content-start -->\n\n${draft.paidSection}` : ""}
`;
}

/** 既存canonical draft pathへ保存する（新規なら作成、既存の同一パスがあれば上書き。他ファイルは触らない） */
export async function saveDraftToObsidian(draft: NoteArticleDraft, articleSessionId?: string): Promise<string> {
  const path = draftVaultPath(draft);
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 新規作成
  }
  await saveVaultFile(path, buildDraftMarkdown(draft, articleSessionId), sha);
  return path;
}
