import "server-only";
import fs from "node:fs";
import path from "node:path";
import { resolveVaultPath } from "@/app/lib/runtime/paths";
import { CAREER_DIVISION_ID, type CareerState } from "./types";
import { careerHash, careerId } from "./ids";

const FILE = "memory/personal/career/career-state.json";
const empty = (): CareerState => ({ sources: [], knowledgeItems: [], batches: [], posts: [], audit: [] });

/** Career raw material is local-only. It never uses the GitHub-backed general Vault writer. */
function localFile() {
  if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN) {
    throw new Error("CAREER_PRIVATE_STORE_REQUIRES_LOCAL_VAULT");
  }
  return resolveVaultPath(FILE);
}
export { careerHash, careerId } from "./ids";

export function loadCareerState(): CareerState {
  const file = localFile();
  if (!fs.existsSync(file)) return empty();
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<CareerState>;
  const state = { ...empty(), ...value } as CareerState;
  for (const group of [state.sources, state.knowledgeItems, state.batches, state.posts, state.audit]) {
    if (!Array.isArray(group) || group.some((item) => item.divisionId !== CAREER_DIVISION_ID)) throw new Error("CAREER_DIVISION_SCOPE_VIOLATION");
  }
  return state;
}
export function saveCareerState(state: CareerState): void {
  for (const group of [state.sources, state.knowledgeItems, state.batches, state.posts, state.audit]) {
    if (!Array.isArray(group) || group.some((item) => item.divisionId !== CAREER_DIVISION_ID)) throw new Error("CAREER_DIVISION_SCOPE_VIOLATION");
  }
  const file = localFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
}
