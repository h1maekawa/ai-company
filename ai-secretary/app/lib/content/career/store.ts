import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveVaultPath } from "@/app/lib/runtime/paths";
import { CAREER_DIVISION_ID, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";

const FILE = "memory/personal/career/career-state.json";
const empty = (): CareerState => ({ sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] });

/**
 * Career raw material is strictly local-only and private.
 * Always resolves to the local vault filesystem path, guaranteeing no remote push.
 */
function localFile(): string {
  return resolveVaultPath(FILE);
}
export { careerHash, careerId } from "./ids";

export function loadCareerState(): CareerState {
  const file = localFile();
  if (!fs.existsSync(file)) return empty();

  try {
    const raw = fs.readFileSync(file, "utf8");
    const value = JSON.parse(raw) as Partial<CareerState>;
    const state = { ...empty(), ...value } as CareerState;
    for (const group of [state.sources, state.knowledgeItems, state.batches, state.posts, state.audit]) {
      if (!Array.isArray(group) || group.some((item) => item.divisionId !== CAREER_DIVISION_ID)) {
        throw new Error("CAREER_DIVISION_SCOPE_VIOLATION");
      }
    }
    return state;
  } catch (error) {
    if ((error as Error).message === "CAREER_DIVISION_SCOPE_VIOLATION") throw error;
    // ファイル破損時のバックアップ読み込み試行
    const backupFile = `${file}.bak`;
    if (fs.existsSync(backupFile)) {
      try {
        const backupRaw = fs.readFileSync(backupFile, "utf8");
        return { ...empty(), ...JSON.parse(backupRaw) } as CareerState;
      } catch {}
    }
    return empty();
  }
}

export function saveCareerState(state: CareerState): void {
  for (const group of [state.sources, state.knowledgeItems, state.batches, state.posts, state.audit]) {
    if (!Array.isArray(group) || group.some((item) => item.divisionId !== CAREER_DIVISION_ID)) {
      throw new Error("CAREER_DIVISION_SCOPE_VIOLATION");
    }
  }
  const file = localFile();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  // 既存ファイルが存在する場合、直前状態をバックアップ
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch {}
  }

  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
}
