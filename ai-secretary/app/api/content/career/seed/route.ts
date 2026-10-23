import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { seedWeek1Batch, WEEK1_CSV_VAULT_PATH } from "@/app/lib/content/career/seedWeek1";
import { parseWeek1Csv } from "@/app/lib/content/career/week1Csv";
import { careerId } from "@/app/lib/content/career/ids";
import { resolveVaultPath } from "@/app/lib/runtime/paths";

export const runtime = "nodejs";

const SAFE_IMPORT_ERRORS = new Set([
  "CSV_EMPTY", "CSV_INVALID_QUOTE", "CSV_UNCLOSED_QUOTE", "CSV_INVALID_HEADERS",
  "CSV_INVALID_ROW_COUNT_OR_WIDTH", "CSV_INVALID_REQUIRED_FIELD", "CSV_INVALID_PLATFORM",
  "CSV_INVALID_STATUS", "CSV_INVALID_X_FIELDS", "CSV_INVALID_INSTAGRAM_FIELDS",
  "CSV_INVALID_PLATFORM_COUNTS", "CSV_INVALID_DAY_DISTRIBUTION", "CSV_DUPLICATE_POST_ROW",
  "WEEK1_BATCH_ALREADY_EXISTS", "WEEK1_SOURCE_ALREADY_IMPORTED", "WEEK1_DUPLICATE_POST_ID",
  "WEEK1_DUPLICATE_POST_CONTENT", "WEEK1_DUPLICATE_KNOWLEDGE_ITEM", "WEEK1_IMPORT_IN_PROGRESS",
  "WEEK1_EXISTING_BACKUP", "WEEK1_EXISTING_STATE_UNREADABLE",
]);

function safeError(error: unknown): string {
  const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const reason = error instanceof Error ? error.message : "IMPORT_FAILED";
  if (reason.includes("VAULT_ROOT")) return "VAULT_NOT_CONFIGURED";
  if (errorCode === "EEXIST") return "WEEK1_IMPORT_IN_PROGRESS";
  if (errorCode === "ENOENT") return "WEEK1_CSV_NOT_FOUND";
  return SAFE_IMPORT_ERRORS.has(reason) ? reason : "IMPORT_FAILED";
}

export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  let lockPath: string | null = null;
  let lockFd: number | null = null;
  try {
    const csvPath = resolveVaultPath(WEEK1_CSV_VAULT_PATH);
    const csvText = fs.readFileSync(csvPath, "utf8");
    parseWeek1Csv(csvText);
    lockPath = resolveVaultPath("memory/personal/career/.week1-import.lock");
    fs.mkdirSync(lockPath.slice(0, lockPath.lastIndexOf("/")), { recursive: true, mode: 0o700 });
    lockFd = fs.openSync(lockPath, "wx", 0o600);

    const statePath = resolveVaultPath("memory/personal/career/career-state.json");
    const backupPath = resolveVaultPath("memory/personal/career/career-state.json.bak");
    if (fs.existsSync(backupPath)) throw new Error("WEEK1_EXISTING_BACKUP");
    if (fs.existsSync(statePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, unknown>;
        for (const key of ["sources", "knowledgeItems", "batches", "posts", "audit"]) {
          const group = saved[key];
          if (group !== undefined && (!Array.isArray(group) || group.some((item) => !item || typeof item !== "object" || (item as { divisionId?: unknown }).divisionId !== "career"))) {
            throw new Error("INVALID_CAREER_STATE");
          }
        }
      }
      catch { throw new Error("WEEK1_EXISTING_STATE_UNREADABLE"); }
    }

    const state = loadCareerState();
    const { batch, posts, source, items } = seedWeek1Batch(state, csvText);

    state.batches.unshift(batch);
    state.posts.unshift(...posts);
    state.sources.unshift(source);
    state.knowledgeItems.unshift(...items);

    state.audit.unshift({
      id: careerId("career_audit"),
      divisionId: "career",
      action: "week1_posts_seeded",
      at: new Date().toISOString(),
      details: { batchId: batch.id, postCount: posts.length },
    });

    saveCareerState(state);
    return NextResponse.json({ success: true, seeded: true, batch, postsCount: posts.length }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = safeError(error);
    const status = code.startsWith("CSV_") ? 422 : code.startsWith("WEEK1_") ? 409 : 500;
    return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (lockFd !== null && lockPath !== null) {
      fs.closeSync(lockFd);
      fs.unlinkSync(lockPath);
    }
  }
}
