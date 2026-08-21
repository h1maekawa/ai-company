/**
 * Note Chat Studio の Vault ストア（article-sessions.md）。
 * Timebox Storageとは完全に分離している（NoteStorageProvider）。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { ArticleSession } from "./types";

const ROOT = "memory/personal/note";

export const NOTE_STUDIO_PATHS = {
  sessions: `${ROOT}/article-sessions.md`,
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

export type SessionsFile = { sessions: ArticleSession[] };

const MAX_SESSIONS = 100;
/** 1セッションあたり保持するメッセージ数の上限（Vaultを無限に太らせない） */
const MAX_MESSAGES_PER_SESSION = 300;

/**
 * NoteStorageProvider — Note Chat Studioが必要とするI/Oの全体像。
 * Timebox Storageとは物理的に別ファイル・別スキーマで、依存関係を持たない。
 */
export interface NoteStorageProvider {
  loadSessions(): Promise<ArticleSession[]>;
  saveSession(session: ArticleSession): Promise<ArticleSession>;
}

export async function loadSessions(): Promise<ArticleSession[]> {
  const data = await readJson<SessionsFile>(NOTE_STUDIO_PATHS.sessions);
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function loadSession(id: string): Promise<ArticleSession | null> {
  const sessions = await loadSessions();
  return sessions.find((s) => s.id === id) ?? null;
}

export async function saveSessions(sessions: ArticleSession[]): Promise<ArticleSession[]> {
  const trimmed = [...sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SESSIONS)
    .map((s) => ({ ...s, messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION) }));

  const human = trimmed
    .slice(0, 30)
    .map((s) => `- [${s.stage}] **${s.title}**（メッセージ${s.messages.length}件）`)
    .join("\n") || "（まだありません）";

  await write(
    NOTE_STUDIO_PATHS.sessions,
    buildDoc(
      "note_article_sessions",
      "Note Chat StudioのArticleSessionです。Timebox Storageとは分離しています。",
      human,
      { sessions: trimmed }
    )
  );
  return trimmed;
}

export async function saveSession(session: ArticleSession): Promise<ArticleSession> {
  const sessions = await loadSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) sessions[index] = session;
  else sessions.unshift(session);
  await saveSessions(sessions);
  return session;
}

export const VaultNoteStorageProvider: NoteStorageProvider = {
  loadSessions,
  saveSession,
};
